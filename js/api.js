// js/api.js

const APICache = {
  CACHE_DURATION_MS: 5 * 60 * 1000, // 5 minutes
  
  getKey: function(action, params) {
    const keyParams = { ...params };
    delete keyParams.token;
    return `api_cache_${action}_${JSON.stringify(keyParams)}`;
  },

  get: function(action, params) {
    const key = this.getKey(action, params);
    const cached = sessionStorage.getItem(key);
    if (!cached) return null;
    
    try {
      const parsed = JSON.parse(cached);
      if (Date.now() - parsed.timestamp > this.CACHE_DURATION_MS) {
        sessionStorage.removeItem(key);
        return null;
      }
      return parsed.data;
    } catch (e) {
      sessionStorage.removeItem(key);
      return null;
    }
  },

  set: function(action, params, data) {
    const key = this.getKey(action, params);
    try {
      sessionStorage.setItem(key, JSON.stringify({
        timestamp: Date.now(),
        data: data
      }));
    } catch (e) {
      console.warn('SessionStorage quota exceeded or error:', e);
    }
  },

  clearAll: function() {
    Object.keys(sessionStorage).forEach(key => {
      if (key.startsWith('api_cache_')) {
        sessionStorage.removeItem(key);
      }
    });
  }
};

const API = {
  // Vercel Static Pre-rendered JSON fetch with ultra-fast loading (< 50ms)
  fetchStaticJSON: async function(action, params = {}) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500); // 2.5s fast timeout

      const res = await fetch(`/data/${action}.json`, {
        signal: controller.signal,
        headers: { 'Cache-Control': 'no-cache' }
      });
      clearTimeout(timeoutId);

      if (!res.ok) return null;
      const json = await res.json();
      if (!json || !json.success || !json.data) return null;

      const filteredData = this.filterStaticData(action, params, json.data);
      console.log(`[Vercel CDN Static Hit] ${action}`, filteredData);
      return { success: true, data: filteredData, isStatic: true };
    } catch (e) {
      console.log(`[Static Fetch Fallback to GAS] ${action}: ${e.message}`);
      return null;
    }
  },

  filterStaticData: function(action, params, data) {
    if (!Array.isArray(data)) return data;

    if (action === 'getMembers') {
      let list = data;
      if (params.status && params.status !== 'all') {
        list = list.filter(m => m.상태 === params.status);
      }
      if (params.teamName && params.teamName !== '전체' && params.teamName !== '관리자') {
        list = list.filter(m => m.팀명 === params.teamName);
      }
      if (params.programName) {
        list = list.filter(m => m.사업명 === params.programName);
      }
      return list;
    }

    if (action === 'getPrograms') {
      let list = data;
      if (params.teamName && params.teamName !== '전체') {
        list = list.filter(p => p.팀명 === params.teamName);
      }
      if (params.status && params.status !== 'all') {
        list = list.filter(p => p.상태 === params.status);
      }
      return list;
    }

    return data;
  },

  fetchGAS: async function(action, params = {}, method = 'POST') {
    const isReadAction = ['getMembers', 'getPrograms', 'getTeams', 'getStats', 'getAllStats'].includes(action);
    const forceRefresh = params.forceRefresh === true;

    // 1. Session Storage Cache check
    if (isReadAction && !forceRefresh) {
      const cachedData = APICache.get(action, params);
      if (cachedData) {
        console.log(`[Browser Cache Hit] ${action}`, cachedData);
        return { success: true, data: cachedData };
      }

      // 2. Ultra-fast Vercel Static Edge CDN fetch
      const staticResult = await this.fetchStaticJSON(action, params);
      if (staticResult) {
        APICache.set(action, params, staticResult.data);
        return staticResult;
      }
    }

    // 3. Fallback / Write Action: Call GAS Web App directly
    const payload = { action, ...params };
    const token = localStorage.getItem('jwt_token');
    
    const options = {
      method: method,
      headers: {
        'Content-Type': method === 'POST' ? 'text/plain;charset=utf-8' : 'application/x-www-form-urlencoded',
      }
    };
    
    if (token) {
      payload.token = token;
    }

    if (method === 'POST') {
      options.body = JSON.stringify(payload);
    }

    let url = CONFIG.GAS_URL;
    if (method === 'GET') {
      const queryStr = new URLSearchParams({ data: JSON.stringify(payload) }).toString();
      url = `${CONFIG.GAS_URL}?${queryStr}`;
    }

    try {
      Utils.showLoading();
      const response = await fetch(url, options);
      const responseData = await response.json();
      Utils.hideLoading();
      
      if (!responseData.success) {
        throw new Error(responseData.message || 'API request failed');
      }
      
      // Clear cache on write operations so next read fetches fresh data
      if (!isReadAction) {
        console.log(`[Cache Cleared] Write action: ${action}`);
        APICache.clearAll();
      } else {
        APICache.set(action, params, responseData.data);
      }
      
      return responseData;
    } catch (error) {
      Utils.hideLoading();
      Utils.showToast(error.message, 'error');
      console.error('API Error:', error);
      throw error;
    }
  }
};
