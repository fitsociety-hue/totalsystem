// js/api.js

const APICache = {
  CACHE_DURATION_MS: 10 * 60 * 1000, // 10 minutes cache
  
  getKey: function(action, params) {
    const keyParams = { ...params };
    delete keyParams.token;
    delete keyParams.forceRefresh;
    return `api_cache_${action}_${JSON.stringify(keyParams)}`;
  },

  get: function(action, params) {
    const key = this.getKey(action, params);
    const cached = sessionStorage.getItem(key) || localStorage.getItem(key);
    if (!cached) return null;
    
    try {
      const parsed = JSON.parse(cached);
      if (Date.now() - parsed.timestamp > this.CACHE_DURATION_MS) {
        sessionStorage.removeItem(key);
        localStorage.removeItem(key);
        return null;
      }
      return parsed.data;
    } catch (e) {
      sessionStorage.removeItem(key);
      localStorage.removeItem(key);
      return null;
    }
  },

  set: function(action, params, data) {
    const key = this.getKey(action, params);
    try {
      const payload = JSON.stringify({
        timestamp: Date.now(),
        data: data
      });
      sessionStorage.setItem(key, payload);
      localStorage.setItem(key, payload);
    } catch (e) {
      console.warn('Cache storage quota exceeded or error:', e);
    }
  },

  clearAll: function() {
    Object.keys(sessionStorage).forEach(key => {
      if (key.startsWith('api_cache_')) sessionStorage.removeItem(key);
    });
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('api_cache_')) localStorage.removeItem(key);
    });
  }
};

const API = {
  // Vercel Static Pre-rendered JSON fetch with ultra-fast loading (< 50ms)
  fetchStaticJSON: async function(action, params = {}) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000); // 2.0s fast timeout

      // Map action to static json file
      const endpointMap = {
        'getMembers': 'getMembers.json',
        'getPrograms': 'getPrograms.json',
        'getTeams': 'getTeams.json',
        'getStats': 'getStats.json',
        'getAllStats': 'getStats.json',
        'getStaffs': 'getStaffs.json',
        'getAttendanceSheet': 'getAttendanceSheet.json',
        'getDailyWorkLogs': 'getDailyWorkLogs.json',
        'getSupervision': 'getSupervision.json'
      };

      const fileName = endpointMap[action] || `${action}.json`;
      const res = await fetch(`/data/${fileName}`, {
        signal: controller.signal,
        headers: { 'Cache-Control': 'no-cache' }
      });
      clearTimeout(timeoutId);

      if (!res.ok) return null;
      const json = await res.json();
      if (!json || !json.success || json.data === undefined) return null;

      const filteredData = this.filterStaticData(action, params, json.data);
      if (filteredData === null) return null;
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
        list = list.filter(m => String(m.상태 || '').trim() === params.status);
      }
      if (params.teamName && params.teamName !== '전체' && params.teamName !== '관리자') {
        list = list.filter(m => String(m.팀명 || '').trim() === params.teamName);
      }
      if (params.programName) {
        list = list.filter(m => String(m.사업명 || '').trim() === params.programName);
      }
      if (params.groupDiv) {
        list = list.filter(m => String(m.그룹구분 || m['그룹/반 구분'] || '').includes(params.groupDiv));
      }
      return list;
    }

    if (action === 'getPrograms') {
      let list = data;
      if (params.teamName && params.teamName !== '전체') {
        list = list.filter(p => String(p.팀명 || '').trim() === params.teamName);
      }
      if (params.status && params.status !== 'all') {
        list = list.filter(p => String(p.상태 || '').trim() === params.status);
      }
      return list;
    }

    if (action === 'getStaffs') {
      let list = data;
      if (params.teamName && params.teamName !== '전체' && params.teamName !== '관리자') {
        list = list.filter(s => String(s.팀명 || '').trim() === params.teamName);
      }
      return list;
    }

    if (action === 'getAttendanceSheet') {
      let list = data;
      if (params.programId && params.programId !== 'all') {
        list = list.filter(a => String(a.사업ID || '').trim() === String(params.programId).trim());
      }
      if (params.date) {
        const targetD = Utils.formatDate(params.date);
        list = list.filter(a => Utils.formatDate(a.날짜) === targetD);
      }
      return list;
    }

    if (action === 'getDailyWorkLogs') {
      let list = data;
      const targetDateStr = Utils.formatDate(params.date || params.startDate || new Date());
      const sD = Utils.formatDate(params.startDate || params.date || targetDateStr);
      const eD = Utils.formatDate(params.endDate || params.date || targetDateStr);

      if (params.teamName && params.teamName !== '전체') {
        list = list.filter(l => String(l.팀명 || '').trim() === params.teamName);
      }
      if (sD && eD) {
        list = list.filter(l => {
          const lD = Utils.formatDate(l.날짜);
          return lD >= sD && lD <= eD;
        });
      }
      if (params.staffNames && params.staffNames.length > 0) {
        list = list.filter(l => params.staffNames.includes(l.직원명));
      }

      // If stats are not pre-computed in static payload, return null to force live GAS call
      return null;
    }

    if (action === 'getSupervision') {
      let list = data;
      if (params.teamName && params.teamName !== '전체') {
        list = list.filter(s => String(s.팀명 || '').trim() === params.teamName);
      }
      if (params.date) {
        const targetD = Utils.formatDate(params.date);
        list = list.filter(s => Utils.formatDate(s.날짜) === targetD);
      }
      return list;
    }

    return data;
  },

  fetchGAS: async function(action, params = {}, method = 'POST') {
    const isReadAction = [
      'getMembers', 'getPrograms', 'getTeams', 'getStats', 'getAllStats',
      'getPersonalStats', 'getStaffs', 'getDailyWorkLogs', 'getAttendanceSheet',
      'getAttendanceSheetAll', 'getSupervision'
    ].includes(action);
    
    const forceRefresh = params.forceRefresh === true;

    // 1. Session & Local Storage Cache check (Instant Return)
    if (isReadAction && !forceRefresh) {
      const cachedData = APICache.get(action, params);
      if (cachedData) {
        console.log(`[Instant Local Cache Hit] ${action}`, cachedData);
        return { success: true, data: cachedData, isCache: true };
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
        const msg = responseData.message || 'API request failed';
        if (msg.includes('만료된 토큰') || msg.includes('유효하지 않은 토큰') || msg.includes('인증 토큰')) {
          if (window.Auth && typeof Auth.handleExpiredToken === 'function') {
            Auth.handleExpiredToken();
          }
        }
        throw new Error(msg);
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
      if (error.message && (error.message.includes('만료된 토큰') || error.message.includes('유효하지 않은 토큰'))) {
        if (window.Auth && typeof Auth.handleExpiredToken === 'function') {
          Auth.handleExpiredToken();
          throw error;
        }
      }
      Utils.showToast(error.message, 'error');
      console.error('API Error:', error);
      throw error;
    }
  }
};
