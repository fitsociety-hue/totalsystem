// js/programs.js

const ProgramsLogic = {
  teams: [
    '지역연계팀', '맞춤지원팀', '건강문화팀', 
    '성장지원팀', '전략기획팀', '미래경영팀'
  ],
  
  loadTeamPrograms: async function(teamName = '', forceRefresh = false) {
    try {
      const res = await API.fetchGAS('getPrograms', { forceRefresh });
      let progs = res.data || [];
      
      // 활성화된 사업만 필터링
      progs = progs.filter(p => p && p.사업명 && String(p.사업명).trim() !== '' && String(p.상태 || '').trim() !== '비활성');

      if (teamName && teamName !== '전체' && teamName !== '관리자') {
        const teamProgs = progs.filter(p => p.팀명 === teamName);
        if (teamProgs.length > 0) return teamProgs;
      }
      return progs;
    } catch (e) {
      console.error('loadTeamPrograms error:', e);
      return [];
    }
  },
  
  // Renders cascaded dropdowns
  renderProgramDropdowns: async function(programs, containerId, onChangeCallback) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    // 만약 데이터가 비어있다면 라이브 서버에서 100% 복구 로드
    if (!programs || programs.length === 0) {
      try {
        programs = await this.loadTeamPrograms('', true);
      } catch (e) {
        programs = [];
      }
    }
    
    // Group programs by classification
    // program: {팀명, 사업분류, 세부사업분류, 사업명, 실적유형, 상태, 사업ID}
    
    // 세부분류 -> 사업 배열로만 그룹화
    const categories = {};
    programs.forEach(p => {
      const c2 = p.세부사업분류 || '기타';
      if (!categories[c2]) categories[c2] = [];
      categories[c2].push(p);
    });

    container.innerHTML = `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px;">
        <div>
          <label class="form-label" style="font-weight: bold;">세부분류</label>
          <select id="sel-cat2" class="form-select" style="width: 100%; height: 44px; font-size: 14px; padding: 8px 12px; box-sizing: border-box; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            <option value="">선택</option>
            ${Object.keys(categories).map(c2 => `<option value="${c2}">${c2}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="form-label" style="font-weight: bold;">사업명</label>
          <select id="sel-prog" class="form-select" disabled style="width: 100%; height: 44px; font-size: 14px; padding: 8px 12px; box-sizing: border-box; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            <option value="">선택</option>
          </select>
        </div>
      </div>
    `;
    
    const selCat2 = document.getElementById('sel-cat2');
    const selProg = document.getElementById('sel-prog');

    let currentPrograms = [];

    selCat2.addEventListener('change', (e) => {
      selProg.innerHTML = '<option value="">선택</option>';
      selProg.disabled = true;

      const c2 = e.target.value;
      if (c2 && categories[c2]) {
        currentPrograms = categories[c2];
        currentPrograms.forEach(p => {
          selProg.innerHTML += `<option value="${p.사업ID}">${p.사업명}</option>`;
        });
        selProg.disabled = false;
        
        if (currentPrograms.length === 1) {
          selProg.value = currentPrograms[0].사업ID;
          setTimeout(() => selProg.dispatchEvent(new Event('change')), 0);
        }
      }
      onChangeCallback(null);
    });

    selProg.addEventListener('change', (e) => {
      const pid = e.target.value;
      if (pid) {
        const selectedP = currentPrograms.find(p => p.사업ID === pid);
        onChangeCallback(selectedP);
      } else {
        onChangeCallback(null);
      }
    });
    
    // Initial auto-select
    const cats2 = Object.keys(categories);
    if (cats2.length === 1) {
      selCat2.value = cats2[0];
      setTimeout(() => selCat2.dispatchEvent(new Event('change')), 0);
    }
  }
};
