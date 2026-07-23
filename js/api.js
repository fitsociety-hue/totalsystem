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
      let workLogs = Array.isArray(data) ? data : (data.workLogs || []);
      let stats = Array.isArray(data) ? [] : (data.stats || []);
      let supervision = Array.isArray(data) ? [] : (data.supervision || []);

      const targetDateStr = Utils.formatDate(params.date || params.startDate || new Date());
      const sD = Utils.formatDate(params.startDate || params.date || targetDateStr);
      const eD = Utils.formatDate(params.endDate || params.date || targetDateStr);

      if (params.teamName && params.teamName !== '전체') {
        workLogs = workLogs.filter(l => String(l.팀명 || '').trim() === params.teamName);
        supervision = supervision.filter(s => String(s.팀명 || '').trim() === params.teamName);
      }
      if (sD && eD) {
        workLogs = workLogs.filter(l => {
          const lD = Utils.formatDate(l.날짜);
          return lD >= sD && lD <= eD;
        });
        supervision = supervision.filter(s => {
          const sDate = Utils.formatDate(s.날짜);
          return sDate >= sD && sDate <= eD;
        });
      }
      if (params.staffNames && params.staffNames.length > 0) {
        workLogs = workLogs.filter(l => params.staffNames.includes(l.직원명));
      }

      if (!stats || stats.length === 0) {
        stats = this.computeDailyWorkLogStats(params.teamName, sD, eD);
      }

      return {
        workLogs: workLogs,
        stats: stats,
        supervision: supervision
      };
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

  computeDailyWorkLogStats: function(teamName, sD, eD) {
    try {
      const cachedProgs = APICache.get('getPrograms', {}) || [];
      const cachedAtt = APICache.get('getAttendanceSheet', {}) || [];
      const cachedMembers = APICache.get('getMembers', {}) || [];
      
      const progs = cachedProgs.filter(p => p && p.상태 === '활성' && (!teamName || teamName === '전체' || p.팀명 === teamName));
      if (progs.length === 0) return [];

      const memberMap = {};
      cachedMembers.forEach(m => { memberMap[m.이름] = m.구분 || '개별'; });

      const targetYear = new Date(eD || new Date()).getFullYear();
      const mStr = String(new Date(eD || new Date()).getMonth() + 1).padStart(2, '0');
      const monthStartStr = `${targetYear}-${mStr}-01`;
      const yearStartStr = `${targetYear}-01-01`;

      const calcStats = (startDateStr, endDateStr) => {
        const progIds = progs.map(p => p.사업ID);
        const progMap = {};
        progs.forEach(p => { progMap[p.사업ID] = p; });

        const periodAtt = cachedAtt.filter(a => {
          if (!progIds.includes(a.사업ID)) return false;
          const dStr = Utils.formatDate(a.날짜);
          return dStr >= startDateStr && dStr <= endDateStr;
        });

        const priorAtt = cachedAtt.filter(a => {
          if (!progIds.includes(a.사업ID)) return false;
          const dStr = Utils.formatDate(a.날짜);
          return dStr >= yearStartStr && dStr < startDateStr;
        });

        const priorNamesByProg = {};
        priorAtt.forEach(a => {
          const p = progMap[a.사업ID];
          if (!p) return;
          const isMemberType = (p.실적유형 !== '건수' && p.실적유형 !== '건수만' && p.실적유형 !== '불특정 인원(실인원, 건수, 연인원)');
          if (isMemberType && a.출석여부 === 'O' && a.이름 !== '건수입력용_무명' && a.이름 !== '불특정_인원_입력') {
            if (!priorNamesByProg[a.사업ID]) priorNamesByProg[a.사업ID] = new Set();
            priorNamesByProg[a.사업ID].add(a.이름);
          }
        });

        const periodAttByProg = {};
        periodAtt.forEach(a => {
          if (!periodAttByProg[a.사업ID]) periodAttByProg[a.사업ID] = [];
          periodAttByProg[a.사업ID].push(a);
        });

        const resStats = {};
        progs.forEach(p => {
          const isMemberType = (p.실적유형 !== '건수' && p.실적유형 !== '건수만' && p.실적유형 !== '불특정 인원(실인원, 건수, 연인원)');
          const isUnspecifiedType = (p.실적유형 === '불특정 인원(실인원, 건수, 연인원)');

          const pAtt = periodAttByProg[p.사업ID] || [];
          const pPriorNames = priorNamesByProg[p.사업ID] || new Set();
          const pNames = new Set();
          let pCumReal = 0;

          pAtt.forEach(a => {
            if (isMemberType && a.출석여부 === 'O' && a.이름 !== '건수입력용_무명' && a.이름 !== '불특정_인원_입력') {
              if (!pPriorNames.has(a.이름)) pNames.add(a.이름);
            }
            if (isUnspecifiedType) pCumReal += Number(a.실인원) || 0;
          });

          let pAccum = 0;
          let pCount = 0;

          if (isMemberType) {
            pAtt.forEach(a => { if (a.출석여부 === 'O') pAccum++; });
            const pDaily = {};
            pAtt.forEach(a => {
              const dStr = Utils.formatDate(a.날짜);
              if (!pDaily[dStr]) pDaily[dStr] = [];
              pDaily[dStr].push(a);
            });
            Object.keys(pDaily).forEach(dStr => {
              const records = pDaily[dStr];
              let hasGroup = false;
              let indvCount = 0;
              records.forEach(a => {
                if (a.출석여부 === 'O') {
                  const mType = memberMap[a.이름] || '개별';
                  if (mType === '그룹') hasGroup = true;
                  else indvCount++;
                }
              });
              pCount += (hasGroup ? 1 : 0) + indvCount;
            });
          } else if (isUnspecifiedType) {
            pAtt.forEach(a => {
              pCount += Number(a.건수) || 0;
              pAccum += Number(a.연인원) || 0;
            });
          } else {
            pAtt.forEach(a => { pCount += Number(a.건수) || 0; });
          }

          resStats[p.사업ID] = {
            실인원: isMemberType ? pNames.size : (isUnspecifiedType ? pCumReal : 0),
            건수: pCount,
            연인원: isMemberType ? pAccum : (isUnspecifiedType ? pAccum : 0)
          };
        });
        return resStats;
      };

      const periodStats = calcStats(sD, eD);
      const monthStats = calcStats(monthStartStr, eD);
      const yearStats = calcStats(yearStartStr, eD);

      return progs.map(p => {
        const pid = p.사업ID;
        const pPeriod = periodStats[pid] || { 실인원: 0, 건수: 0, 연인원: 0 };
        const pMonth = monthStats[pid] || { 실인원: 0, 건수: 0, 연인원: 0 };
        const pYear = yearStats[pid] || { 실인원: 0, 건수: 0, 연인원: 0 };

        const goalReal = Number(p.목표_실인원) || 0;
        const goalCount = Number(p.목표_건수) || 0;
        const goalAccum = Number(p.목표_연인원) || 0;

        let achieveRate = 0;
        const isMemberType = (p.실적유형 !== '건수' && p.실적유형 !== '건수만' && p.실적유형 !== '불특정 인원(실인원, 건수, 연인원)');
        if (isMemberType) {
          achieveRate = goalAccum > 0 ? Math.round((pYear.연인원 / goalAccum) * 100) : 0;
        } else {
          achieveRate = goalCount > 0 ? Math.round((pYear.건수 / goalCount) * 100) : 0;
        }

        return {
          사업ID: pid,
          사업명: p.사업명,
          사업분류: p.사업분류,
          세부사업분류: p.세부사업분류,
          실적유형: p.실적유형,
          목표: { 실인원: goalReal, 건수: goalCount, 연인원: goalAccum },
          일계: pPeriod,
          월계: pMonth,
          누계: pYear,
          달성률: achieveRate
        };
      });
    } catch(e) {
      console.warn('computeDailyWorkLogStats warning:', e);
      return [];
    }
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
