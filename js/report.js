// js/report.js

let currentMode = 'write'; // 'write' or 'view'
let teamStaffList = [];
let currentReportData = null;

document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.requireAuth()) return;
  Auth.updateUserUI();

  // Set default date picker values
  const todayStr = Utils.formatDate(new Date());
  const writeDateEl = document.getElementById('write-date');
  if (writeDateEl) writeDateEl.value = todayStr;
  document.getElementById('view-start-date').value = todayStr;
  document.getElementById('view-end-date').value = todayStr;

  // Set report change event
  document.getElementById('view-report-type').addEventListener('change', handleReportTypeChange);
  if (writeDateEl) writeDateEl.addEventListener('change', loadWritePrograms);

  // Admin view-mode change handler
  document.getElementById('admin-view-mode').addEventListener('change', handleAdminViewModeChange);

  // Admin team change handler
  document.getElementById('admin-view-team').addEventListener('change', async () => {
    await loadAdminStaffDropdown();
    await initStaffSelection();
  });

  // Admin individual staff change handler
  document.getElementById('admin-staff-select').addEventListener('change', () => {
    // auto-generate on staff change if already viewing
    if (currentReportData) generateReport();
  });

  const user = Auth.getUser();

  if (user.role === '관리자') {
    // === ADMIN: Hide tabs and write section, show view-only ===
    const tabsDiv = document.querySelector('.report-tabs');
    if (tabsDiv) tabsDiv.style.display = 'none';
    const secWrite = document.getElementById('section-write');
    if (secWrite) secWrite.style.display = 'none';
    const secView = document.getElementById('section-view');
    if (secView) secView.classList.remove('hidden');

    // Show admin-specific controls
    document.getElementById('admin-team-select-wrapper').style.display = 'inline-block';
    document.getElementById('admin-view-mode-wrapper').style.display = 'inline-block';

    // Load teams
    try {
      const res = await API.fetchGAS('getTeams');
      const teams = res.data || [];
      const select = document.getElementById('admin-view-team');
      select.innerHTML = '';
      teams.forEach(t => {
        select.innerHTML += `<option value="${t}">${t}</option>`;
      });
    } catch(e) {
      console.error('Error fetching teams:', e);
    }

    // Load staff dropdown for individual mode
    await loadAdminStaffDropdown();

    // Handle initial view mode state
    handleAdminViewModeChange();
  } else {
    // Non-admin: keep original tab behavior
    document.getElementById('admin-view-mode-wrapper').style.display = 'none';
    document.getElementById('admin-staff-select-wrapper').style.display = 'none';

    if (user.role === '팀장') {
      document.getElementById('admin-team-select-wrapper').style.display = 'none';
    }
  }

  // Initialize view mode UI
  handleReportTypeChange();

  // Load staff list if Leader or Admin
  await initStaffSelection();

  // Load programs to write for today (skip for admin)
  if (user.role !== '관리자') {
    await loadWritePrograms();
  }
});

function setMode(mode) {
  currentMode = mode;
  const btnWrite = document.getElementById('tab-write-mode');
  const btnView = document.getElementById('tab-view-mode');
  const secWrite = document.getElementById('section-write');
  const secView = document.getElementById('section-view');

  if (mode === 'write') {
    btnWrite.className = 'btn-primary flex-1';
    btnView.className = 'btn-secondary flex-1';
    secWrite.classList.remove('hidden');
    secView.classList.add('hidden');
    loadWritePrograms();
  } else {
    btnWrite.className = 'btn-secondary flex-1';
    btnView.className = 'btn-primary flex-1';
    secWrite.classList.add('hidden');
    secView.classList.remove('hidden');
    renderStaffCheckboxes();
  }
}

async function initStaffSelection() {
  const user = Auth.getUser();
  const container = document.getElementById('staff-select-container');
  
  if (user.role === '관리자') {
    const viewMode = document.getElementById('admin-view-mode').value;
    if (viewMode === 'individual') {
      // Individual mode: hide checkboxes
      container.classList.add('hidden');
      return;
    }
    // Team mode: show checkboxes
    container.classList.remove('hidden');
    try {
      const teamName = document.getElementById('admin-view-team').value;
      const res = await API.fetchGAS('getStaffs', { teamName });
      teamStaffList = res.data || [];
      renderStaffCheckboxes();
    } catch(e) {
      console.error('Error fetching staff list:', e);
    }
  } else if (user.role === '팀장') {
    container.classList.remove('hidden');
    try {
      const res = await API.fetchGAS('getStaffs', { teamName: user.team });
      teamStaffList = res.data || [];
      renderStaffCheckboxes();
    } catch(e) {
      console.error('Error fetching staff list:', e);
    }
  } else {
    container.classList.add('hidden');
  }
}

function renderStaffCheckboxes() {
  const listDiv = document.getElementById('staff-checkbox-list');
  if (!listDiv) return;
  listDiv.innerHTML = '';
  
  if (teamStaffList.length === 0) {
    listDiv.innerHTML = '<span class="text-sub">소속 팀에 다른 직원이 없습니다.</span>';
    return;
  }

  const user = Auth.getUser();
  teamStaffList.forEach(s => {
    listDiv.innerHTML += `
      <label class="staff-checkbox-item">
        <input type="checkbox" name="chk-staff" value="${s.이름}" checked>
        <span>${s.이름} (${s.직위 || '팀원'})</span>
      </label>
    `;
  });
}

window.toggleAllStaff = function(checked) {
  const chks = document.getElementsByName('chk-staff');
  chks.forEach(c => c.checked = checked);
}

// === Admin View Mode Switch ===
function handleAdminViewModeChange() {
  const mode = document.getElementById('admin-view-mode').value;
  const staffSelectWrapper = document.getElementById('admin-staff-select-wrapper');
  const staffCheckboxContainer = document.getElementById('staff-select-container');
  
  if (mode === 'individual') {
    staffSelectWrapper.style.display = 'inline-block';
    staffCheckboxContainer.classList.add('hidden');
  } else {
    staffSelectWrapper.style.display = 'none';
    staffCheckboxContainer.classList.remove('hidden');
    initStaffSelection();
  }
}

// === Load Admin Staff Dropdown (for individual mode) ===
async function loadAdminStaffDropdown() {
  const teamName = document.getElementById('admin-view-team').value;
  if (!teamName) return;
  
  try {
    const res = await API.fetchGAS('getStaffs', { teamName });
    const staffs = res.data || [];
    const select = document.getElementById('admin-staff-select');
    select.innerHTML = '';
    staffs.forEach(s => {
      select.innerHTML += `<option value="${s.이름}">${s.이름} (${s.직위 || '팀원'})</option>`;
    });
  } catch(e) {
    console.error('Error loading staff for individual select:', e);
  }
}

// === PDF Export Function ===
window.downloadReportPDF = function() {
  window.print();
}

function handleReportTypeChange() {
  const type = document.getElementById('view-report-type').value;
  const startInput = document.getElementById('view-start-date');
  const endInput = document.getElementById('view-end-date');
  const tilde = document.getElementById('date-range-tilde');
  
  const today = new Date();
  
  if (type === 'daily') {
    endInput.style.display = 'none';
    tilde.style.display = 'none';
    startInput.value = Utils.formatDate(today);
  } else if (type === 'weekly') {
    endInput.style.display = 'inline-block';
    tilde.style.display = 'inline-block';
    
    // Set current week (Monday to Sunday)
    const day = today.getDay();
    const diffToMon = today.getDate() - day + (day === 0 ? -6 : 1);
    const mon = new Date(today.setDate(diffToMon));
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    
    startInput.value = Utils.formatDate(mon);
    endInput.value = Utils.formatDate(sun);
  } else if (type === 'monthly') {
    endInput.style.display = 'inline-block';
    tilde.style.display = 'inline-block';
    
    // Set current month 1st to last day
    const y = today.getFullYear();
    const m = today.getMonth();
    const firstDay = new Date(y, m, 1);
    const lastDay = new Date(y, m + 1, 0);
    
    startInput.value = Utils.formatDate(firstDay);
    endInput.value = Utils.formatDate(lastDay);
  }
}

async function loadWritePrograms() {
  const user = Auth.getUser();
  const dateStr = document.getElementById('write-date').value;
  const listContainer = document.getElementById('write-program-list');
  listContainer.innerHTML = '<p class="text-center">로딩 중...</p>';

  try {
    const teamName = user.role === '관리자' ? '' : user.team;
    
    // 1. Get user's programs (팀원의 경우 지정된 사업이 있으면 해당 사업 우선, 없으면 팀 전체 사업 표시)
    let programs = await ProgramsLogic.loadTeamPrograms(teamName, true);
    if (user.role !== '관리자') {
      const userAssigned = programs.filter(p => p.담당자 && p.담당자.includes(user.name));
      if (userAssigned.length > 0) {
        programs = userAssigned;
      }
    }

    // 2. Add COMMON worklog card at the first position
    programs.unshift({
      사업ID: 'COMMON',
      사업명: '오늘의 종합 업무 내용',
      실적유형: '공통',
      사업분류: '공통'
    });

    // 3. Load existing logs & attendance for pre-filling (Single batch fetch instead of sequential calls)
    const [logRes, attAllRes] = await Promise.all([
      API.fetchGAS('getDailyWorkLogs', { date: dateStr, teamName: user.team, staffNames: [user.name] }),
      API.fetchGAS('getAttendanceSheet', { date: dateStr })
    ]);
    
    const existingLogs = (logRes && logRes.data && logRes.data.workLogs) || [];
    const allAttList = (attAllRes && attAllRes.data) || [];
    
    listContainer.innerHTML = '';
    
    for (const p of programs) {
      const log = existingLogs.find(l => l.사업ID === p.사업ID) || { 업무내용: '' };
      let rateHtml = '';
      
      if (p.실적유형 === '공통') {
        rateHtml = `
          <div class="mb-2" style="font-size: 13px; color: var(--color-text-sub);">
            오늘 하루 동안 진행하신 전반적인 업무 총평 및 종합 실적 내용을 자유롭게 작성해 주세요. (Ctrl + Enter로 빠른 저장 가능)
          </div>
        `;
      } else {
        const attList = Array.isArray(allAttList) ? allAttList.filter(a => String(a.사업ID || '').trim() === String(p.사업ID).trim()) : [];
        const unspecAtt = attList.find(a => a.이름 === '불특정_인원_입력');
        const anonymousAtt = attList.find(a => a.이름 === '건수입력용_무명');

        let effectiveType = p.실적유형;
        if (unspecAtt) {
          effectiveType = '불특정 인원(실인원, 건수, 연인원)';
        } else if (anonymousAtt) {
          effectiveType = '건수';
        }

        if (effectiveType === '건수' || effectiveType === '건수만') {
          const countVal = anonymousAtt ? (anonymousAtt.건수 || 0) : 0;
          rateHtml = `
            <div class="form-group mb-2">
              <label class="form-label" style="font-size:13px; font-weight:bold;">실적 입력 (건수)</label>
              <input type="number" id="perf-count-${p.사업ID}" class="form-input" style="max-width: 120px;" value="${countVal}" min="0">
            </div>
          `;
        } else if (effectiveType === '불특정 인원(실인원, 건수, 연인원)' || effectiveType === '불특정') {
          const uAtt = unspecAtt || {};
          rateHtml = `
            <div class="mb-1" style="font-size:11px; color:var(--color-primary-dark); background:rgba(59,130,246,0.06); padding:4px 8px; border-radius:4px;">
              💡 <b>신규 반영 실인원</b>: 당해 연도/기간 중 처음 참석하는 신규 인원만 입력하세요. (기존 참여자는 제외)
            </div>
            <div class="grid-cards mb-2" style="grid-template-columns: repeat(3, 1fr); gap: 10px;">
              <div class="form-group mb-0">
                <label class="form-label" style="font-size:12px; font-weight:bold;">신규 반영 실인원</label>
                <input type="number" id="perf-unspec-real-${p.사업ID}" class="form-input" value="${uAtt.실인원 || 0}" placeholder="신규 추가 실인원">
              </div>
              <div class="form-group mb-0">
                <label class="form-label" style="font-size:12px; font-weight:bold;">건수</label>
                <input type="number" id="perf-unspec-count-${p.사업ID}" class="form-input" value="${uAtt.건수 || 0}">
              </div>
              <div class="form-group mb-0">
                <label class="form-label" style="font-size:12px; font-weight:bold;">당일 총 연인원</label>
                <input type="number" id="perf-unspec-accum-${p.사업ID}" class="form-input" value="${uAtt.연인원 || 0}">
              </div>
            </div>
            <div class="grid-cards mb-2" style="grid-template-columns: repeat(3, 1fr); gap: 10px; background: rgba(0,0,0,0.02); padding: 8px; border-radius: 6px;">
              <div class="form-group mb-0">
                <label class="form-label" style="font-size:11px; color:var(--color-text-sub);">직원수</label>
                <input type="number" id="perf-unspec-staff-${p.사업ID}" class="form-input" value="${uAtt.세부_직원 || 0}">
              </div>
              <div class="form-group mb-0">
                <label class="form-label" style="font-size:11px; color:var(--color-text-sub);">장애인수</label>
                <input type="number" id="perf-unspec-disabled-${p.사업ID}" class="form-input" value="${uAtt.세부_장애인 || 0}">
              </div>
              <div class="form-group mb-0">
                <label class="form-label" style="font-size:11px; color:var(--color-text-sub);">비장애인수</label>
                <input type="number" id="perf-unspec-nondisabled-${p.사업ID}" class="form-input" value="${uAtt.세부_비장애인 || 0}">
              </div>
            </div>
          `;
        } else {
          const attendedCount = attList.filter(a => a.출석여부 === 'O' && a.이름 !== '건수입력용_무명' && a.이름 !== '불특정_인원_입력').length;
          rateHtml = `
            <div class="mb-2" style="font-size: 13px; color: var(--color-primary-dark);">
              ℹ️ 일반 회원제 사업입니다. 실적 입력은 <strong><a href="attendance.html" style="text-decoration: underline;">출석체크</a></strong> 페이지에서 진행해주세요. (오늘 출석: <strong>${attendedCount}명</strong>)
            </div>
          `;
        }
      }

      listContainer.innerHTML += `
        <div class="work-input-card" data-id="${p.사업ID}" data-name="${p.사업명}" data-type="${p.실적유형}">
          <div class="flex justify-between items-start mb-2">
            <h4 style="margin: 0; color: var(--color-text);">${p.사업명}</h4>
            <span class="badge badge-primary">${p.실적유형}</span>
          </div>
          
          ${rateHtml}
          
          <div class="form-group mb-0 mt-3">
            <label class="form-label" style="font-size:13px; font-weight:bold;">업무 내용 입력</label>
            <textarea id="work-desc-${p.사업ID}" class="form-input work-textarea" rows="3" placeholder="내용을 여기에 상세히 기재해 주세요.">${log.업무내용 || ''}</textarea>
          </div>
        </div>
      `;
      
      // Auto-sum logic registration for unspec type
      if (p.실적유형 === '불특정 인원(실인원, 건수, 연인원)') {
        setTimeout(() => {
          const ids = [`perf-unspec-staff-${p.사업ID}`, `perf-unspec-disabled-${p.사업ID}`, `perf-unspec-nondisabled-${p.사업ID}`];
          ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
              el.addEventListener('input', () => {
                const s = parseInt(document.getElementById(`perf-unspec-staff-${p.사업ID}`).value, 10) || 0;
                const d = parseInt(document.getElementById(`perf-unspec-disabled-${p.사업ID}`).value, 10) || 0;
                const n = parseInt(document.getElementById(`perf-unspec-nondisabled-${p.사업ID}`).value, 10) || 0;
                document.getElementById(`perf-unspec-accum-${p.사업ID}`).value = s + d + n;
              });
            }
          });
        }, 100);
      }
    }

    // 4. 텍스트 영역 높이 자동 확장 및 Ctrl+Enter 저장 단축키 등록
    setTimeout(() => {
      document.querySelectorAll('.work-textarea').forEach(txt => {
        const autoResize = () => {
          txt.style.height = 'auto';
          txt.style.height = Math.max(90, txt.scrollHeight + 4) + 'px';
        };
        txt.addEventListener('input', autoResize);
        autoResize();

        txt.addEventListener('keydown', (e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            saveDailyWorkLog();
          }
        });
      });
    }, 100);

  } catch(e) {
    console.error(e);
    listContainer.innerHTML = '<p class="text-center text-error">데이터를 불러오는 중 오류가 발생했습니다.</p>';
  }
}

async function saveDailyWorkLog() {
  const user = Auth.getUser();
  const dateStr = document.getElementById('write-date').value;
  const cards = document.querySelectorAll('.work-input-card');
  
  if (cards.length === 0) return;
  
  const workLogs = [];
  const perfPromises = [];
  
  try {
    Utils.showLoading();
    
    for (const card of cards) {
      const pid = card.getAttribute('data-id');
      const pname = card.getAttribute('data-name');
      const ptype = card.getAttribute('data-type');
      
      const descEl = document.getElementById(`work-desc-${pid}`);
      const desc = descEl ? descEl.value.trim() : '';
      
      if (desc) {
        workLogs.push({ 사업ID: pid, 사업명: pname, 업무내용: desc });
      }
      
      // 1. 실적 값 병렬 저장 처리
      if (ptype === '건수') {
        const countInput = document.getElementById(`perf-count-${pid}`);
        if (countInput) {
          const count = parseInt(countInput.value, 10) || 0;
          perfPromises.push(API.fetchGAS('submitCountOnly', { programId: pid, date: dateStr, count }));
        }
      } else if (ptype === '불특정 인원(실인원, 건수, 연인원)') {
        const realInput = document.getElementById(`perf-unspec-real-${pid}`);
        if (realInput) {
          const real = parseInt(realInput.value, 10) || 0;
          const count = parseInt(document.getElementById(`perf-unspec-count-${pid}`).value, 10) || 0;
          const staff = parseInt(document.getElementById(`perf-unspec-staff-${pid}`).value, 10) || 0;
          const disabled = parseInt(document.getElementById(`perf-unspec-disabled-${pid}`).value, 10) || 0;
          const nondisabled = parseInt(document.getElementById(`perf-unspec-nondisabled-${pid}`).value, 10) || 0;
          
          const data = {
            realCount: real,
            count: count,
            accumCount: staff + disabled + nondisabled,
            staffCount: staff,
            disabledCount: disabled,
            nonDisabledCount: nondisabled,
            remark: ''
          };
          perfPromises.push(API.fetchGAS('submitUnspecifiedAttendance', { programId: pid, date: dateStr, data }));
        }
      }
    }
    
    // 실적 값 병렬 전송
    if (perfPromises.length > 0) {
      await Promise.all(perfPromises);
    }

    // 2. 업무 내용 텍스트 일괄 저장
    await API.fetchGAS('submitDailyWorkLog', { date: dateStr, workLogs });
    
    // 3. 최근 저장 캐시 즉시 비우기 (통합 조회 탭 전환 시 신규 내용 즉각 반영)
    if (window.APICache && typeof APICache.clearAll === 'function') {
      APICache.clearAll();
    }

    Utils.hideLoading();
    Utils.showToast('일일 업무 및 실적이 안전하게 저장되었습니다.', 'success');
  } catch(e) {
    Utils.hideLoading();
    Utils.showToast('저장 중 오류가 발생했습니다: ' + e.message, 'error');
  }
}

async function generateReport() {
  const user = Auth.getUser();
  const type = document.getElementById('view-report-type').value;
  const startDate = document.getElementById('view-start-date').value;
  let endDate = document.getElementById('view-end-date').value;
  
  if (type === 'daily') {
    endDate = startDate;
  }
  
  const teamName = user.role === '관리자' ? document.getElementById('admin-view-team').value : user.team;
  
  // Determine staff names based on mode
  let selectedStaffs = [];
  
  if (user.role === '관리자') {
    const viewMode = document.getElementById('admin-view-mode').value;
    if (viewMode === 'individual') {
      const staffName = document.getElementById('admin-staff-select').value;
      if (!staffName) {
        Utils.showToast('조회할 직원을 선택해주세요.', 'warning');
        return;
      }
      selectedStaffs = [staffName];
    } else {
      // Team mode: collect from checkboxes
      const staffChks = document.getElementsByName('chk-staff');
      staffChks.forEach(c => {
        if (c.checked) selectedStaffs.push(c.value);
      });
      if (selectedStaffs.length === 0) {
        Utils.showToast('최소 한 명 이상의 직원을 선택해주세요.', 'warning');
        return;
      }
    }
  } else if (user.role === '팀장') {
    const staffChks = document.getElementsByName('chk-staff');
    staffChks.forEach(c => {
      if (c.checked) selectedStaffs.push(c.value);
    });
    if (selectedStaffs.length === 0) {
      Utils.showToast('최소 한 명 이상의 직원을 선택해주세요.', 'warning');
      return;
    }
  } else {
    // Staff member: use own name
    selectedStaffs = [user.name];
  }

  try {
    Utils.showLoading();
    const params = { date: startDate, startDate, endDate, teamName, staffNames: selectedStaffs };
    
    const res = await API.fetchGAS('getDailyWorkLogs', params);
    if (!res || !res.success || !res.data) {
      throw new Error('서버로부터 보고서 데이터를 정상적으로 불러오지 못했습니다.');
    }

    currentReportData = res.data;
    
    renderReportPreview(type, startDate, endDate, teamName);
    Utils.hideLoading();
  } catch(e) {
    Utils.hideLoading();
    Utils.showToast('보고서 집계에 실패했습니다: ' + e.message, 'error');
  }
}

function getDayOfWeek(dateStr) {
  const week = ['일', '월', '화', '수', '목', '금', '토'];
  const day = new Date(dateStr).getDay();
  return week[day];
}

function renderReportPreview(type, startDate, endDate, teamName) {
  document.getElementById('report-preview-container').classList.remove('hidden');
  
  const titleEl = document.getElementById('preview-title');
  const dateEl = document.getElementById('preview-date-str');
  const thLabel = document.getElementById('th-period-label');
  
  // Set headers based on type
  if (type === 'daily') {
    titleEl.textContent = `${teamName} 업무일지`;
    dateEl.textContent = `${startDate} ${getDayOfWeek(startDate)}요일`;
    thLabel.textContent = '일계';
  } else if (type === 'weekly') {
    titleEl.textContent = `${teamName} 주간업무일지`;
    dateEl.textContent = `${startDate} ~ ${endDate}`;
    thLabel.textContent = '주간계';
  } else {
    const endObj = new Date(endDate);
    const m = endObj.getMonth() + 1;
    titleEl.textContent = `${teamName} 업무일지(${m}월 통합실적)`;
    dateEl.textContent = `${endObj.getFullYear()}년 ${m}월`;
    thLabel.textContent = '월계';
  }

  // Draw Stats Table
  const tbody = document.getElementById('report-table-body');
  tbody.innerHTML = '';
  
  // Filter out COMMON logic from stats table
  const programs = (currentReportData.stats || []).filter(p => p.사업ID !== 'COMMON');
  
  if (programs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="15">해당 기간의 실적이 없습니다.</td></tr>';
  } else {
    // Group programs by '사업분류'
    const grouped = {};
    programs.forEach(p => {
      const cat = p.사업분류 || '기타';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(p);
    });

    let totalGoal = { real: 0, count: 0, accum: 0 };
    let totalPeriod = { real: 0, count: 0, accum: 0 };
    let totalMonth = { real: 0, count: 0, accum: 0 };
    let totalYear = { real: 0, count: 0, accum: 0 };

    Object.keys(grouped).forEach(cat => {
      const items = grouped[cat];
      
      items.forEach((p, idx) => {
        const isFirst = (idx === 0);
        
        // Sum grand totals
        totalGoal.real += p.목표.realCount || p.목표.실인원 || 0;
        totalGoal.count += p.목표.count || p.목표.건수 || 0;
        totalGoal.accum += p.목표.accumCount || p.목표.연인원 || 0;
        
        totalPeriod.real += p.일계.실인원 || 0;
        totalPeriod.count += p.일계.건수 || 0;
        totalPeriod.accum += p.일계.연인원 || 0;
        
        totalMonth.real += p.월계.실인원 || 0;
        totalMonth.count += p.월계.건수 || 0;
        totalMonth.accum += p.월계.연인원 || 0;
        
        totalYear.real += p.누계.실인원 || 0;
        totalYear.count += p.누계.건수 || 0;
        totalYear.accum += p.누계.연인원 || 0;

        const formatVal = (v) => v === 0 ? '' : Utils.formatNumber(v);

        tbody.innerHTML += `
          <tr>
            ${isFirst ? `<td rowspan="${items.length}" style="font-weight:bold; vertical-align:middle; background:#fafafa;">${cat}</td>` : ''}
            <td class="align-left">${p.사업명}</td>
            
            <td>${formatVal(p.목표.실인원)}</td>
            <td>${formatVal(p.목표.건수)}</td>
            <td>${formatVal(p.목표.연인원)}</td>
            
            <td class="bg-light-blue">${formatVal(p.일계.실인원)}</td>
            <td class="bg-light-blue">${formatVal(p.일계.건수)}</td>
            <td class="bg-light-blue">${formatVal(p.일계.연인원)}</td>
            
            <td>${formatVal(p.월계.실인원)}</td>
            <td>${formatVal(p.월계.건수)}</td>
            <td>${formatVal(p.월계.연인원)}</td>
            
            <td>${formatVal(p.누계.실인원)}</td>
            <td>${formatVal(p.누계.건수)}</td>
            <td>${formatVal(p.누계.연인원)}</td>
            
            <td style="font-weight:bold; color:var(--color-primary-dark);">${p.달성률 || 0}%</td>
          </tr>
        `;
      });
    });

    // Append Grand Total Row
    const grandRate = totalGoal.accum > 0 ? Math.round((totalYear.accum / totalGoal.accum) * 100) : 0;
    tbody.innerHTML += `
      <tr style="background:#f2f2f2; font-weight:bold;">
        <td colspan="2" style="border: 1px solid #333333;">총 합계</td>
        <td style="border: 1px solid #333333;">${Utils.formatNumber(totalGoal.real)}</td>
        <td style="border: 1px solid #333333;">${Utils.formatNumber(totalGoal.count)}</td>
        <td style="border: 1px solid #333333;">${Utils.formatNumber(totalGoal.accum)}</td>
        
        <td class="bg-light-blue" style="border: 1px solid #333333;">${Utils.formatNumber(totalPeriod.real)}</td>
        <td class="bg-light-blue" style="border: 1px solid #333333;">${Utils.formatNumber(totalPeriod.count)}</td>
        <td class="bg-light-blue" style="border: 1px solid #333333;">${Utils.formatNumber(totalPeriod.accum)}</td>
        
        <td style="border: 1px solid #333333;">${Utils.formatNumber(totalMonth.real)}</td>
        <td style="border: 1px solid #333333;">${Utils.formatNumber(totalMonth.count)}</td>
        <td style="border: 1px solid #333333;">${Utils.formatNumber(totalMonth.accum)}</td>
        
        <td style="border: 1px solid #333333;">${Utils.formatNumber(totalYear.real)}</td>
        <td style="border: 1px solid #333333;">${Utils.formatNumber(totalYear.count)}</td>
        <td style="border: 1px solid #333333;">${Utils.formatNumber(totalYear.accum)}</td>
        
        <td style="border: 1px solid #333333;">${grandRate}%</td>
      </tr>
    `;
  }

  // Draw Work Log Contents (grouped by Staff)
  const workContentDiv = document.getElementById('preview-work-content');
  workContentDiv.innerHTML = '';
  
  const logs = currentReportData.workLogs || [];
  const staffLogs = {};
  logs.forEach(l => {
    if (!staffLogs[l.직원명]) staffLogs[l.직원명] = [];
    staffLogs[l.직원명].push(l);
  });

  if (Object.keys(staffLogs).length === 0) {
    workContentDiv.innerHTML = '<div style="padding:15px; color:var(--color-text-sub);">작성된 주요 업무 내용이 없습니다.</div>';
  } else {
    let html = '<table style="width:100%; border-collapse:collapse; border:none; margin:0;">';
    Object.keys(staffLogs).forEach((sName, sIdx) => {
      const items = staffLogs[sName];
      
      // Separate common log and business logs
      const commonLog = items.find(it => it.사업ID === 'COMMON');
      const businessLogs = items.filter(it => it.사업ID !== 'COMMON');
      
      let bulletText = '';
      if (commonLog) {
        bulletText += `[오늘의 종합 업무 내용]\n${commonLog.업무내용.split('\n').map(line => ' * ' + line.trim()).join('\n')}\n\n`;
      }
      
      if (businessLogs.length > 0) {
        bulletText += businessLogs.map(it => {
          return `[${it.사업명}]\n${it.업무내용.split('\n').map(line => ' * ' + line.trim()).join('\n')}`;
        }).join('\n\n');
      }
      
      html += `
        <tr style="border-bottom: 1px solid #333333; ${sIdx === Object.keys(staffLogs).length - 1 ? 'border-bottom:none;' : ''}">
          <td style="width:149px; border:none; border-right:1px solid #333333; background-color:#fafafa; font-weight:bold; vertical-align:middle; text-align:center; padding:12px;">${sName}</td>
          <td style="border:none; text-align:left; padding:12px; vertical-align:top;">
            <textarea class="edit-worklog-input" data-staff="${sName}" style="width:100%; min-height:120px; font-size:12px; resize:vertical; padding:8px; border:1px solid #ddd; border-radius:4px; line-height:1.6; background-color:rgba(0,0,0,0.01);">${bulletText.trim()}</textarea>
          </td>
        </tr>
      `;
    });
    html += '</table>';
    workContentDiv.innerHTML = html;
  }

  // Draw Supervision (General & Individual)
  const supervisionDiv = document.getElementById('preview-supervision');
  const user = Auth.getUser();
  
  // Selected staff list for individual supervision inputs
  let selectedStaffs = [];
  if (user.role === '관리자') {
    const viewMode = document.getElementById('admin-view-mode').value;
    if (viewMode === 'individual') {
      const staffName = document.getElementById('admin-staff-select').value;
      if (staffName) selectedStaffs = [staffName];
    } else {
      const staffChks = document.getElementsByName('chk-staff');
      staffChks.forEach(c => { if (c.checked) selectedStaffs.push(c.value); });
    }
  } else {
    const staffChks = document.getElementsByName('chk-staff');
    staffChks.forEach(c => { if (c.checked) selectedStaffs.push(c.value); });
  }
  
  const savedSupervisions = currentReportData.supervision || [];
  
  // Extract total supervision text
  let totalSpText = '';
  if (Array.isArray(savedSupervisions)) {
    const totalSp = savedSupervisions.find(s => s.대상자명 === '전체');
    if (totalSp) totalSpText = totalSp.슈퍼비전내용 || '';
  } else if (savedSupervisions && typeof savedSupervisions === 'object') {
    totalSpText = savedSupervisions.슈퍼비전내용 || ''; // fallback
  }

  if (user.role === '팀장' || user.role === '관리자') {
    if (type === 'daily') {
      // Build supervision edit area
      let html = `
        <div style="margin-bottom: 16px;">
          <label style="font-weight:bold; font-size:13px; color:var(--color-primary-dark); display:block; margin-bottom:6px;">📢 팀 전체 대상 슈퍼비전</label>
          <textarea id="supervision-total" class="supervision-textarea" style="min-height: 80px;" placeholder="팀 전체에게 일괄 제공할 피드백 및 공지사항을 입력하세요.">${totalSpText}</textarea>
        </div>
      `;
      
      // Individual inputs for each selected staff
      selectedStaffs.forEach(sName => {
        // Skip supervisor's own individual supervision if wanted, but here we provide it for all selected
        let indvSpText = '';
        if (Array.isArray(savedSupervisions)) {
          const match = savedSupervisions.find(s => s.대상자명 === sName);
          if (match) indvSpText = match.슈퍼비전내용 || '';
        }
        
        html += `
          <div style="margin-bottom: 12px; padding: 10px; background: rgba(0,0,0,0.01); border-radius: 8px; border: 1px solid rgba(0,0,0,0.04);">
            <label style="font-weight:bold; font-size:12px; display:block; margin-bottom:4px;">👤 ${sName}님 개별 슈퍼비전</label>
            <textarea class="supervision-textarea individual-supervision-input" data-staff="${sName}" style="min-height: 60px;" placeholder="${sName}님에게 전달할 개별 슈퍼비전을 입력하세요.">${indvSpText}</textarea>
          </div>
        `;
      });
      
      html += `
        <div style="text-align: right; margin-top:8px;">
          <button class="btn-primary" onclick="saveAllPreviewChanges('${startDate}', '${teamName}')" style="padding: 8px 20px; font-size:13px;">💾 업무내용 및 슈퍼비전 통합 저장</button>
        </div>
      `;
      supervisionDiv.innerHTML = html;
    } else {
      // Weekly/Monthly view mode (Read-only 취합)
      let html = '';
      if (Array.isArray(savedSupervisions) && savedSupervisions.length > 0) {
        savedSupervisions.forEach(s => {
          html += `<strong>[대상: ${s.대상자명 || '전체'} / 작성: ${s.작성자명}]</strong>\n${s.슈퍼비전내용}\n\n`;
        });
      } else {
        html = '지정된 슈퍼비전 사항이 없습니다.';
      }
      supervisionDiv.innerHTML = `<div style="white-space:pre-line; line-height:1.6;">${html}</div>`;
    }
  } else {
    // Member view mode (Read-only)
    let html = '';
    if (Array.isArray(savedSupervisions) && savedSupervisions.length > 0) {
      savedSupervisions.forEach(s => {
        html += `<strong>[대상: ${s.대상자명 || '전체'} / 작성: ${s.작성자명}]</strong>\n${s.슈퍼비전내용}\n\n`;
      });
    } else {
      html = '지정된 슈퍼비전 사항이 없습니다.';
    }
    supervisionDiv.innerHTML = `<div style="white-space:pre-line; line-height:1.6;">${html}</div>`;
  }
}

window.saveAllPreviewChanges = async function(date, teamName) {
  const supervisions = [];
  
  const totalEl = document.getElementById('supervision-total');
  if (totalEl) {
    const txt = totalEl.value.trim();
    if (txt) {
      supervisions.push({ 대상자명: '전체', 내용: txt });
    }
  }
  
  const indvInputs = document.querySelectorAll('.individual-supervision-input');
  indvInputs.forEach(input => {
    const sName = input.getAttribute('data-staff');
    const txt = input.value.trim();
    if (txt) {
      supervisions.push({ 대상자명: sName, 내용: txt });
    }
  });

  // Extract edited work logs
  const bulkLogs = [];
  const worklogInputs = document.querySelectorAll('.edit-worklog-input');
  worklogInputs.forEach(input => {
    const sName = input.getAttribute('data-staff');
    const rawText = input.value.trim();
    if (!rawText) return;
    
    const regex = /\[(.*?)\]([\s\S]*?)(?=\n\[|$)/g;
    let match;
    let parsedLogs = [];
    let hasMatch = false;
    
    while ((match = regex.exec(rawText)) !== null) {
      hasMatch = true;
      let pName = match[1].trim();
      let pContent = match[2].trim();
      pContent = pContent.replace(/^\s*\*\s*/gm, '').trim(); 
      if (pName === '오늘의 종합 업무 내용') pName = 'COMMON';
      parsedLogs.push({ 사업명: pName, 업무내용: pContent });
    }
    
    if (!hasMatch) {
      let cleanText = rawText.replace(/^\s*\*\s*/gm, '').trim();
      parsedLogs.push({ 사업명: 'COMMON', 업무내용: cleanText });
    }
    
    bulkLogs.push({ 직원명: sName, logs: parsedLogs });
  });

  try {
    Utils.showLoading();
    const tasks = [];
    // Only call supervision API if there's supervision area rendered (daily view)
    if (document.getElementById('supervision-total')) {
      tasks.push(API.fetchGAS('submitSupervision', { date, teamName, supervisions }));
    }
    if (bulkLogs.length > 0) {
      tasks.push(API.fetchGAS('submitDailyWorkLogBulk', { date, teamName, bulkLogs }));
    }
    
    if (tasks.length > 0) {
      await Promise.all(tasks);
      Utils.showToast('통합 저장(업무내용 및 슈퍼비전)이 완료되었습니다.', 'success');
      // reload
      setTimeout(() => generateReport(), 800);
    } else {
      Utils.showToast('저장할 내용이 없습니다.', 'info');
    }
    Utils.hideLoading();
  } catch(e) {
    Utils.hideLoading();
    Utils.showToast('통합 저장 실패: ' + e.message, 'error');
  }
}

window.downloadReportExcel = function() {
  if (!currentReportData) return;
  
  const type = document.getElementById('view-report-type').value;
  const startDate = document.getElementById('view-start-date').value;
  const endDate = document.getElementById('view-end-date').value;
  const user = Auth.getUser();
  const teamName = user.role === '관리자' ? document.getElementById('admin-view-team').value : user.team;

  let reportTitle = '';
  let periodStr = '';
  let subLabel = '';
  
  if (type === 'daily') {
    reportTitle = `${teamName} 업무일지`;
    periodStr = `${startDate} (${getDayOfWeek(startDate)}요일)`;
    subLabel = '일계';
  } else if (type === 'weekly') {
    reportTitle = `${teamName} 주간업무일지`;
    periodStr = `${startDate} ~ ${endDate}`;
    subLabel = '주간계';
  } else {
    const endObj = new Date(endDate);
    const m = endObj.getMonth() + 1;
    reportTitle = `${teamName} 업무일지(${m}월 통합실적)`;
    periodStr = `${endObj.getFullYear()}년 ${m}월`;
    subLabel = '월계';
  }

  const wb = XLSX.utils.book_new();
  
  const titleRow = [reportTitle];
  const dateRow = [null, null, null, null, null, null, null, null, null, null, null, null, null, periodStr];
  
  const header1 = ['업무실적', null, '목표', null, null, subLabel, null, null, '월계', null, null, '누계', null, null, '달성률(%)'];
  const header2 = [null, null, '실인원', '건수', '연인원', '실인원', '건수', '연인원', '실인원', '건수', '연인원', '실인원', '건수', '연인원', null];

  const aoa = [
    titleRow,
    dateRow,
    [],
    header1,
    header2
  ];

  const merges = [
    { s: {r:0, c:0}, e: {r:0, c:14} }, 
    { s: {r:1, c:11}, e: {r:1, c:14} }, 
    { s: {r:3, c:0}, e: {r:4, c:1} }, 
    { s: {r:3, c:2}, e: {r:3, c:4} }, 
    { s: {r:3, c:5}, e: {r:3, c:7} }, 
    { s: {r:3, c:8}, e: {r:3, c:10} }, 
    { s: {r:3, c:11}, e: {r:3, c:13} }, 
    { s: {r:3, c:14}, e: {r:4, c:14} }  
  ];

  // Filter out COMMON logic from excel stats
  const programs = (currentReportData.stats || []).filter(p => p.사업ID !== 'COMMON');
  
  // Group programs by '사업분류'
  const grouped = {};
  programs.forEach(p => {
    const cat = p.사업분류 || '기타';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(p);
  });

  let totalGoal = { real: 0, count: 0, accum: 0 };
  let totalPeriod = { real: 0, count: 0, accum: 0 };
  let totalMonth = { real: 0, count: 0, accum: 0 };
  let totalYear = { real: 0, count: 0, accum: 0 };

  let currentRowIdx = 5;

  Object.keys(grouped).forEach(cat => {
    const items = grouped[cat];
    merges.push({ s: {r: currentRowIdx, c:0}, e: {r: currentRowIdx + items.length - 1, c:0} });

    items.forEach((p, idx) => {
      totalGoal.real += p.목표.실인원 || 0;
      totalGoal.count += p.목표.건수 || 0;
      totalGoal.accum += p.목표.연인원 || 0;
      
      totalPeriod.real += p.일계.실인원 || 0;
      totalPeriod.count += p.일계.건수 || 0;
      totalPeriod.accum += p.일계.연인원 || 0;
      
      totalMonth.real += p.월계.실인원 || 0;
      totalMonth.count += p.월계.건수 || 0;
      totalMonth.accum += p.월계.연인원 || 0;
      
      totalYear.real += p.누계.실인원 || 0;
      totalYear.count += p.누계.건수 || 0;
      totalYear.accum += p.누계.연인원 || 0;

      aoa.push([
        cat,
        p.사업명,
        p.목표.실인원 || 0,
        p.목표.건수 || 0,
        p.목표.연인원 || 0,
        p.일계.실인원 || 0,
        p.일계.건수 || 0,
        p.일계.연인원 || 0,
        p.월계.실인원 || 0,
        p.월계.건수 || 0,
        p.월계.연인원 || 0,
        p.누계.실인원 || 0,
        p.누계.건수 || 0,
        p.누계.연인원 || 0,
        `${p.달성률 || 0}%`
      ]);
      currentRowIdx++;
    });
  });

  // Grand Total Row push
  const grandRate = totalGoal.accum > 0 ? Math.round((totalYear.accum / totalGoal.accum) * 100) : 0;
  aoa.push([
    '총 합계', null,
    totalGoal.real, totalGoal.count, totalGoal.accum,
    totalPeriod.real, totalPeriod.count, totalPeriod.accum,
    totalMonth.real, totalMonth.count, totalMonth.accum,
    totalYear.real, totalYear.count, totalYear.accum,
    `${grandRate}%`
  ]);
  merges.push({ s: {r: currentRowIdx, c:0}, e: {r: currentRowIdx, c:1} });
  currentRowIdx++;

  // Add memo rows space
  aoa.push([]);
  currentRowIdx++;

  // 1) 주요 업무 내용 기입
  aoa.push(['■ 주요 업무 내용']);
  merges.push({ s: {r: currentRowIdx, c:0}, e: {r: currentRowIdx, c:14} });
  currentRowIdx++;

  const logs = currentReportData.workLogs || [];
  const staffLogs = {};
  logs.forEach(l => {
    if (!staffLogs[l.직원명]) staffLogs[l.직원명] = [];
    staffLogs[l.직원명].push(l);
  });

  if (Object.keys(staffLogs).length === 0) {
    aoa.push(['주요 업무 내용', '작성된 업무 내용이 없습니다.']);
    merges.push({ s: {r: currentRowIdx, c:1}, e: {r: currentRowIdx, c:14} });
    currentRowIdx++;
  } else {
    Object.keys(staffLogs).forEach(sName => {
      const items = staffLogs[sName];
      const commonLog = items.find(it => it.사업ID === 'COMMON');
      const businessLogs = items.filter(it => it.사업ID !== 'COMMON');
      
      let bulletText = '';
      if (commonLog) {
        bulletText += `[오늘의 종합 업무 내용] ${commonLog.업무내용}\n`;
      }
      if (businessLogs.length > 0) {
        bulletText += businessLogs.map(it => `[${it.사업명}] ${it.업무내용}`).join('\n');
      }
      
      aoa.push([sName, bulletText.trim()]);
      merges.push({ s: {r: currentRowIdx, c:1}, e: {r: currentRowIdx, c:14} });
      currentRowIdx++;
    });
  }

  // 2) 슈퍼비전 기입
  aoa.push(['■ 슈퍼비전']);
  merges.push({ s: {r: currentRowIdx, c:0}, e: {r: currentRowIdx, c:14} });
  currentRowIdx++;

  const savedSupervisions = currentReportData.supervision || [];
  let spText = '';
  if (Array.isArray(savedSupervisions) && savedSupervisions.length > 0) {
    spText = savedSupervisions.map(s => `[대상: ${s.대상자명 || '전체'} / 작성자: ${s.작성자명}]: ${s.슈퍼비전내용}`).join('\n');
  } else {
    spText = '지정된 슈퍼비전 사항이 없습니다.';
  }
  
  aoa.push(['슈퍼비전 내용', spText]);
  merges.push({ s: {r: currentRowIdx, c:1}, e: {r: currentRowIdx, c:14} });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!merges'] = merges;

  // Set Widths
  ws['!cols'] = [
    {wch: 15}, {wch: 30}, 
    {wch: 8}, {wch: 8}, {wch: 8}, 
    {wch: 8}, {wch: 8}, {wch: 8}, 
    {wch: 8}, {wch: 8}, {wch: 8}, 
    {wch: 8}, {wch: 8}, {wch: 8}, 
    {wch: 12} 
  ];

  XLSX.utils.book_append_sheet(wb, ws, '업무일지');
  XLSX.writeFile(wb, `업무일지_${teamName}_${startDate}_${type}.xlsx`);
  Utils.showToast('엑셀 파일이 다운로드되었습니다.', 'success');
}
