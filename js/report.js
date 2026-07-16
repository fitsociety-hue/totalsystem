// js/report.js

let currentMode = 'write'; // 'write' or 'view'
let teamStaffList = [];
let currentReportData = null;

document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.requireAuth()) return;
  Auth.updateUserUI();

  // Set default date picker values
  const todayStr = Utils.formatDate(new Date());
  document.getElementById('write-date').value = todayStr;
  document.getElementById('view-start-date').value = todayStr;
  document.getElementById('view-end-date').value = todayStr;

  // Set report change event
  document.getElementById('view-report-type').addEventListener('change', handleReportTypeChange);
  document.getElementById('write-date').addEventListener('change', loadWritePrograms);

  // Initialize view mode UI
  handleReportTypeChange();

  // Load staff list if Leader or Admin
  await initStaffSelection();

  // Load programs to write for today
  await loadWritePrograms();
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
  
  if (user.role === '팀장' || user.role === '관리자') {
    container.classList.remove('hidden');
    try {
      const teamName = user.role === '관리자' ? '' : user.team;
      const res = await API.fetchGAS('getStaffs', { teamName });
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
    const isMe = s.이름 === user.name;
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
    
    // 1. Get user's programs
    let programs = await ProgramsLogic.loadTeamPrograms(teamName, true);
    if (user.role !== '관리자') {
      programs = programs.filter(p => p.담당자 && p.담당자.includes(user.name));
    }

    if (programs.length === 0) {
      listContainer.innerHTML = '<p class="text-center text-sub">오늘 담당으로 지정된 사업이 없습니다. 사업 관리에서 담당자를 지정해주세요.</p>';
      return;
    }

    // 2. Load existing logs & attendance for pre-filling
    const logRes = await API.fetchGAS('getDailyWorkLogs', { date: dateStr, teamName: user.team, staffNames: [user.name] });
    const existingLogs = logRes.data.workLogs || [];
    
    listContainer.innerHTML = '';
    
    for (const p of programs) {
      const log = existingLogs.find(l => l.사업ID === p.사업ID) || { 업무내용: '' };
      
      // Fetch attendance to display/fill count or unspecified details
      const attRes = await API.fetchGAS('getAttendanceSheet', { programId: p.사업ID, date: dateStr, forceRefresh: true });
      const attList = attRes.data || [];
      
      let rateHtml = '';
      
      if (p.실적유형 === '건수') {
        const anonymousAtt = attList.find(a => a.이름 === '건수입력용_무명');
        const countVal = anonymousAtt ? (anonymousAtt.건수 || 0) : 0;
        rateHtml = `
          <div class="form-group mb-2">
            <label class="form-label" style="font-size:13px; font-weight:bold;">실적 입력 (건수)</label>
            <input type="number" id="perf-count-${p.사업ID}" class="form-input" style="max-width: 120px;" value="${countVal}" min="0">
          </div>
        `;
      } else if (p.실적유형 === '불특정 인원(실인원, 건수, 연인원)') {
        const unspecAtt = attList.find(a => a.이름 === '불특정_인원_입력') || {};
        rateHtml = `
          <div class="grid-cards mb-2" style="grid-template-columns: repeat(3, 1fr); gap: 10px;">
            <div class="form-group mb-0">
              <label class="form-label" style="font-size:12px; font-weight:bold;">실인원</label>
              <input type="number" id="perf-unspec-real-${p.사업ID}" class="form-input" value="${unspecAtt.실인원 || 0}">
            </div>
            <div class="form-group mb-0">
              <label class="form-label" style="font-size:12px; font-weight:bold;">건수</label>
              <input type="number" id="perf-unspec-count-${p.사업ID}" class="form-input" value="${unspecAtt.건수 || 0}">
            </div>
            <div class="form-group mb-0">
              <label class="form-label" style="font-size:12px; font-weight:bold;">연인원 (자동합산)</label>
              <input type="number" id="perf-unspec-accum-${p.사업ID}" class="form-input" value="${unspecAtt.연인원 || 0}" readonly>
            </div>
          </div>
          <div class="grid-cards mb-2" style="grid-template-columns: repeat(3, 1fr); gap: 10px; background: rgba(0,0,0,0.02); padding: 8px; border-radius: 6px;">
            <div class="form-group mb-0">
              <label class="form-label" style="font-size:11px; color:var(--color-text-sub);">직원수</label>
              <input type="number" id="perf-unspec-staff-${p.사업ID}" class="form-input" value="${unspecAtt.세부_직원 || 0}">
            </div>
            <div class="form-group mb-0">
              <label class="form-label" style="font-size:11px; color:var(--color-text-sub);">장애인수</label>
              <input type="number" id="perf-unspec-disabled-${p.사업ID}" class="form-input" value="${unspecAtt.세부_장애인 || 0}">
            </div>
            <div class="form-group mb-0">
              <label class="form-label" style="font-size:11px; color:var(--color-text-sub);">비장애인수</label>
              <input type="number" id="perf-unspec-nondisabled-${p.사업ID}" class="form-input" value="${unspecAtt.세부_비장애인 || 0}">
            </div>
          </div>
        `;
      } else {
        // Member-based program (출석체크로 처리됨)
        const attendedCount = attList.filter(a => a.출석여부 === 'O').length;
        rateHtml = `
          <div class="mb-2" style="font-size: 13px; color: var(--color-primary-dark);">
            ℹ️ 일반 회원제 사업입니다. 실적 입력은 <strong><a href="attendance.html" style="text-decoration: underline;">출석체크</a></strong> 페이지에서 진행해주세요. (오늘 출석: <strong>${attendedCount}명</strong>)
          </div>
        `;
      }

      listContainer.innerHTML += `
        <div class="work-input-card" data-id="${p.사업ID}" data-name="${p.사업명}" data-type="${p.실적유형}">
          <div class="flex justify-between items-start mb-2">
            <h4 style="margin: 0; color: var(--color-text);">${p.사업명}</h4>
            <span class="badge badge-primary">${p.실적유형}</span>
          </div>
          
          ${rateHtml}
          
          <div class="form-group mb-0 mt-3">
            <label class="form-label" style="font-size:13px; font-weight:bold;">일일 주요 업무 내용</label>
            <textarea id="work-desc-${p.사업ID}" class="form-input" rows="3" placeholder="오늘 진행하신 세부 업무 내용을 상세히 적어주세요.">${log.업무내용 || ''}</textarea>
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
  } catch(e) {
    listContainer.innerHTML = '<p class="text-center text-error">데이터를 불러오는 중 오류가 발생했습니다.</p>';
  }
}

async function saveDailyWorkLog() {
  const user = Auth.getUser();
  const dateStr = document.getElementById('write-date').value;
  const cards = document.querySelectorAll('.work-input-card');
  
  if (cards.length === 0) return;
  
  const workLogs = [];
  
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
      
      // 1. 실적 값 저장 처리
      if (ptype === '건수') {
        const countInput = document.getElementById(`perf-count-${pid}`);
        const count = parseInt(countInput.value, 10) || 0;
        await API.fetchGAS('submitCountOnly', { programId: pid, date: dateStr, count });
      } else if (ptype === '불특정 인원(실인원, 건수, 연인원)') {
        const real = parseInt(document.getElementById(`perf-unspec-real-${pid}`).value, 10) || 0;
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
        await API.fetchGAS('submitUnspecifiedAttendance', { programId: pid, date: dateStr, data });
      }
    }
    
    // 2. 업무 내용 텍스트 일괄 저장
    await API.fetchGAS('submitDailyWorkLog', { date: dateStr, workLogs });
    
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
  
  // Collect selected staffs
  const staffChks = document.getElementsByName('chk-staff');
  const selectedStaffs = [];
  staffChks.forEach(c => {
    if (c.checked) selectedStaffs.push(c.value);
  });
  
  if (selectedStaffs.length === 0 && (user.role === '팀장' || user.role === '관리자')) {
    Utils.showToast('최소 한 명 이상의 직원을 선택해주세요.', 'warning');
    return;
  }

  try {
    Utils.showLoading();
    const teamName = user.role === '관리자' ? '전략기획팀' : user.team; // Fallback to 전략기획팀 (for sample view)
    const params = { date: startDate, startDate, endDate, teamName, staffNames: selectedStaffs };
    
    const res = await API.fetchGAS('getDailyWorkLogs', params);
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
  
  const programs = currentReportData.stats || [];
  
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
        totalGoal.real += p.목표.실인원;
        totalGoal.count += p.목표.count || p.목표.건수 || 0;
        totalGoal.accum += p.목표.accumCount || p.목표.연인원 || 0;
        
        totalPeriod.real += p.일계.실인원;
        totalPeriod.count += p.일계.건수;
        totalPeriod.accum += p.일계.연인원;
        
        totalMonth.real += p.월계.실인원;
        totalMonth.count += p.월계.건수;
        totalMonth.accum += p.월계.연인원;
        
        totalYear.real += p.누계.실인원;
        totalYear.count += p.누계.건수;
        totalYear.accum += p.누계.연인원;

        const isUnspecified = (p.실적유형 === '불특정 인원(실인원, 건수, 연인원)');
        const formatVal = (v) => v === 0 ? '' : Utils.formatNumber(v);

        tbody.innerHTML += `
          <tr>
            ${isFirst ? `<td rowspan="${items.length}" style="font-weight:bold; vertical-align:middle; background:#fafafa;">${cat}</td>` : ''}
            <td class="align-left">${p.사업명}</td>
            
            <td>${formatVal(p.목표.실인원)}</td>
            <td>${formatVal(p.목표.count || p.목표.건수 || 0)}</td>
            <td>${formatVal(p.목표.accumCount || p.목표.연인원 || 0)}</td>
            
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
        <td colspan="2">총 합계</td>
        <td>${Utils.formatNumber(totalGoal.real)}</td>
        <td>${Utils.formatNumber(totalGoal.count)}</td>
        <td>${Utils.formatNumber(totalGoal.accum)}</td>
        
        <td class="bg-light-blue">${Utils.formatNumber(totalPeriod.real)}</td>
        <td class="bg-light-blue">${Utils.formatNumber(totalPeriod.count)}</td>
        <td class="bg-light-blue">${Utils.formatNumber(totalPeriod.accum)}</td>
        
        <td>${Utils.formatNumber(totalMonth.real)}</td>
        <td>${Utils.formatNumber(totalMonth.count)}</td>
        <td>${Utils.formatNumber(totalMonth.accum)}</td>
        
        <td>${Utils.formatNumber(totalYear.real)}</td>
        <td>${Utils.formatNumber(totalYear.count)}</td>
        <td>${Utils.formatNumber(totalYear.accum)}</td>
        
        <td>${grandRate}%</td>
      </tr>
    `;
  }

  // Draw Work Log Contents (grouped by Staff)
  const workContentDiv = document.getElementById('preview-work-content');
  workContentDiv.innerHTML = '';
  
  const logs = currentReportData.workLogs || [];
  
  // Group logs by staffName
  const staffLogs = {};
  logs.forEach(l => {
    if (!staffLogs[l.직원명]) staffLogs[l.직원명] = [];
    staffLogs[l.직원명].push(l);
  });

  if (Object.keys(staffLogs).length === 0) {
    workContentDiv.innerHTML = '<div style="padding:15px; color:var(--color-text-sub);">작성된 주요 업무 내용이 없습니다.</div>';
  } else {
    // Generate clean text list layout
    let html = '<table style="width:100%; border-collapse:collapse; border:none; margin:0;">';
    Object.keys(staffLogs).forEach((sName, sIdx) => {
      const items = staffLogs[sName];
      const bulletText = items.map(it => {
        return `[${it.사업명}] \n ${it.업무내용.split('\n').map(line => ' * ' + line.trim()).join('\n')}`;
      }).join('\n\n');
      
      html += `
        <tr style="border-bottom: 1px solid #333333; ${sIdx === Object.keys(staffLogs).length - 1 ? 'border-bottom:none;' : ''}">
          <td style="width:149px; border:none; border-right:1px solid #333333; background-color:#fafafa; font-weight:bold; vertical-align:middle; text-align:center; padding:12px;">${sName}</td>
          <td style="border:none; text-align:left; padding:12px; white-space:pre-line; line-height:1.6; font-size:12px;">${bulletText}</td>
        </tr>
      `;
    });
    html += '</table>';
    workContentDiv.innerHTML = html;
  }

  // Draw Supervision
  const supervisionDiv = document.getElementById('preview-supervision');
  const user = Auth.getUser();
  
  let spText = '';
  if (currentReportData.supervision) {
    if (Array.isArray(currentReportData.supervision)) {
      spText = currentReportData.supervision.map(s => `[${Utils.formatDate(s.날짜)} - ${s.작성자명}]: \n${s.슈퍼비전내용}`).join('\n\n');
    } else {
      spText = currentReportData.supervision.슈퍼비전내용 || '';
    }
  }

  if (user.role === '팀장' || user.role === '관리자') {
    // Allow editing supervision for the single day
    if (type === 'daily') {
      supervisionDiv.innerHTML = `
        <textarea id="supervision-input" class="supervision-textarea" placeholder="팀원 업무일지에 대한 피드백 및 지시사항(슈퍼비전)을 남겨주세요.">${spText}</textarea>
        <div style="text-align: right; margin-top:8px;">
          <button class="btn-primary" onclick="saveSupervision('${startDate}', '${teamName}')" style="padding: 6px 16px; font-size:13px;">슈퍼비전 저장</button>
        </div>
      `;
    } else {
      supervisionDiv.innerHTML = `<div style="white-space:pre-line; line-height:1.6;">${spText || '지정된 슈퍼비전 사항이 없습니다.'}</div>`;
    }
  } else {
    supervisionDiv.innerHTML = `<div style="white-space:pre-line; line-height:1.6;">${spText || '지정된 슈퍼비전 사항이 없습니다.'}</div>`;
  }
}

window.saveSupervision = async function(date, teamName) {
  const input = document.getElementById('supervision-input');
  if (!input) return;
  const content = input.value.trim();
  
  try {
    Utils.showLoading();
    await API.fetchGAS('submitSupervision', { date, teamName, content });
    Utils.hideLoading();
    Utils.showToast('슈퍼비전이 등록되었습니다.', 'success');
  } catch(e) {
    Utils.hideLoading();
    Utils.showToast('슈퍼비전 저장 실패: ' + e.message, 'error');
  }
}

window.downloadReportExcel = function() {
  if (!currentReportData) return;
  
  const type = document.getElementById('view-report-type').value;
  const startDate = document.getElementById('view-start-date').value;
  const endDate = document.getElementById('view-end-date').value;
  const user = Auth.getUser();
  const teamName = user.role === '관리자' ? '전략기획팀' : user.team;

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
  
  // Layout AOA build
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
    { s: {r:0, c:0}, e: {r:0, c:14} }, // Title merge
    { s: {r:1, c:11}, e: {r:1, c:14} }, // Date str merge
    { s: {r:3, c:0}, e: {r:4, c:1} }, // 업무실적 th merge
    { s: {r:3, c:2}, e: {r:3, c:4} }, // 목표 th merge
    { s: {r:3, c:5}, e: {r:3, c:7} }, // 일계 th merge
    { s: {r:3, c:8}, e: {r:3, c:10} }, // 월계 th merge
    { s: {r:3, c:11}, e: {r:3, c:13} }, // 누계 th merge
    { s: {r:3, c:14}, e: {r:4, c:14} }  // 달성률 th merge
  ];

  const programs = currentReportData.stats || [];
  
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
    
    // Group category th merge mapping
    merges.push({ s: {r: currentRowIdx, c:0}, e: {r: currentRowIdx + items.length - 1, c:0} });

    items.forEach((p, idx) => {
      // Sum totals
      totalGoal.real += p.목표.실인원;
      totalGoal.count += p.목표.count || p.목표.건수 || 0;
      totalGoal.accum += p.목표.accumCount || p.목표.연인원 || 0;
      
      totalPeriod.real += p.일계.실인원;
      totalPeriod.count += p.일계.건수;
      totalPeriod.accum += p.일계.연인원;
      
      totalMonth.real += p.월계.실인원;
      totalMonth.count += p.월계.건수;
      totalMonth.accum += p.월계.연인원;
      
      totalYear.real += p.누계.실인원;
      totalYear.count += p.누계.건수;
      totalYear.accum += p.누계.연인원;

      aoa.push([
        cat,
        p.사업명,
        p.목표.실인원 || 0,
        p.목표.count || p.목표.건수 || 0,
        p.목표.accumCount || p.목표.연인원 || 0,
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
      const bulletText = items.map(it => `[${it.사업명}] ${it.업무내용}`).join('\n');
      
      aoa.push([sName, bulletText]);
      merges.push({ s: {r: currentRowIdx, c:1}, e: {r: currentRowIdx, c:14} });
      currentRowIdx++;
    });
  }

  // 2) 슈퍼비전 기입
  aoa.push(['■ 슈퍼비전']);
  merges.push({ s: {r: currentRowIdx, c:0}, e: {r: currentRowIdx, c:14} });
  currentRowIdx++;

  let spText = '지정된 슈퍼비전 사항이 없습니다.';
  if (currentReportData.supervision) {
    if (Array.isArray(currentReportData.supervision)) {
      spText = currentReportData.supervision.map(s => `[${Utils.formatDate(s.날짜)} - ${s.작성자명}]: \n${s.슈퍼비전내용}`).join('\n\n');
    } else {
      spText = currentReportData.supervision.슈퍼비전내용 || '';
    }
  }
  
  aoa.push(['슈퍼비전 내용', spText]);
  merges.push({ s: {r: currentRowIdx, c:1}, e: {r: currentRowIdx, c:14} });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!merges'] = merges;

  // Set Widths
  ws['!cols'] = [
    {wch: 15}, {wch: 30}, // Business names
    {wch: 8}, {wch: 8}, {wch: 8}, // Target
    {wch: 8}, {wch: 8}, {wch: 8}, // Period
    {wch: 8}, {wch: 8}, {wch: 8}, // Month
    {wch: 8}, {wch: 8}, {wch: 8}, // Accum
    {wch: 12} // Achieve rate
  ];

  XLSX.utils.book_append_sheet(wb, ws, '업무일지');
  XLSX.writeFile(wb, `업무일지_${teamName}_${startDate}_${type}.xlsx`);
  Utils.showToast('엑셀 파일이 다운로드되었습니다.', 'success');
}
