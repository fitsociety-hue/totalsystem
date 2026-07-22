// js/staff.js

let allStaffList = [];

document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.requireAuth()) return;
  Auth.updateUserUI();

  const user = Auth.getUser();
  if (user.role !== '관리자') {
    alert('직원 관리 권한이 없습니다.');
    window.location.href = 'dashboard.html';
    return;
  }

  const searchInput = document.getElementById('staff-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', () => renderFilteredStaffList());
  }

  await loadStaffList();
});

async function loadStaffList(forceRefresh = false) {
  const tbody = document.querySelector('#staff-table tbody');
  if (!tbody) return;

  try {
    Utils.showLoading();
    const res = await API.fetchGAS('getStaffsAll', forceRefresh ? { forceRefresh: true } : {});
    allStaffList = res.data || [];
    Utils.hideLoading();

    updateStaffSummaryCards(allStaffList);
    renderFilteredStaffList();
  } catch (e) {
    Utils.hideLoading();
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-error">직원 목록을 불러오지 못했습니다. (' + e.message + ')</td></tr>';
  }
}

function updateStaffSummaryCards(staffs) {
  const total = staffs.length;
  const active = staffs.filter(s => (s.상태 || '재직') === '재직').length;
  const leave = staffs.filter(s => s.상태 === '휴직').length;
  const retired = staffs.filter(s => s.상태 === '퇴사' || s.상태 === '비활성').length;

  document.getElementById('count-total-staff').textContent = `${total}명`;
  document.getElementById('count-active-staff').textContent = `${active}명`;
  document.getElementById('count-leave-staff').textContent = `${leave}명`;
  document.getElementById('count-retired-staff').textContent = `${retired}명`;
}

function renderFilteredStaffList() {
  const tbody = document.querySelector('#staff-table tbody');
  if (!tbody) return;

  const query = (document.getElementById('staff-search-input').value || '').trim().toLowerCase();
  
  const filtered = allStaffList.filter(s => {
    if (!query) return true;
    const nameStr = String(s.이름 || '').toLowerCase();
    const teamStr = String(s.팀명 || '').toLowerCase();
    const posStr = String(s.직위 || s.권한 || '').toLowerCase();
    return nameStr.includes(query) || teamStr.includes(query) || posStr.includes(query);
  });

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center">검색 결과가 없습니다.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(s => {
    const currentStatus = s.상태 || '재직';
    let statusBadgeClass = 'badge-success';
    if (currentStatus === '휴직') statusBadgeClass = 'badge-warning';
    if (currentStatus === '퇴사' || currentStatus === '비활성') statusBadgeClass = 'badge-neutral';

    return `
      <tr>
        <td data-label="부서(팀명)">${s.팀명 || '-'}</td>
        <td data-label="이름"><strong>${s.이름}</strong></td>
        <td data-label="직위/권한">${s.직위 || s.권한 || '직원'}</td>
        <td data-label="재직 상태">
          <select class="form-select" style="max-width: 110px; padding: 6px 8px; font-weight:bold;" onchange="changeStaffStatus('${s.직원ID}', this.value)">
            <option value="재직" ${currentStatus === '재직' ? 'selected' : ''}>재직</option>
            <option value="휴직" ${currentStatus === '휴직' ? 'selected' : ''}>휴직</option>
            <option value="퇴사" ${currentStatus === '퇴사' || currentStatus === '비활성' ? 'selected' : ''}>퇴사</option>
          </select>
        </td>
        <td data-label="비밀번호 설정">
          <button class="btn-secondary" style="padding: 6px 12px; font-size: 13px; border-color:var(--color-primary); color:var(--color-primary);" onclick="promptResetStaffPassword('${s.직원ID}', '${s.이름}')">비밀번호 초기화</button>
        </td>
      </tr>
    `;
  }).join('');
}

async function changeStaffStatus(staffId, newStatus) {
  try {
    await API.fetchGAS('updateStaffStatus', { staffId, status: newStatus });
    const match = allStaffList.find(s => s.직원ID === staffId);
    if (match) match.상태 = newStatus;
    updateStaffSummaryCards(allStaffList);
    Utils.showToast(`직원 상태가 '${newStatus}'(으)로 변경되었습니다.`, 'success');
  } catch (e) {
    Utils.showToast(e.message, 'error');
  }
}

async function promptResetStaffPassword(staffId, staffName) {
  const newPw = prompt(`[${staffName}] 직원의 새 비밀번호를 입력하세요:`, '1234');
  if (newPw === null) return;
  if (!newPw.trim()) {
    Utils.showToast('새 비밀번호를 입력해 주세요.', 'warning');
    return;
  }

  try {
    await API.fetchGAS('resetStaffPassword', { staffId, newPassword: newPw.trim() });
    Utils.showToast(`[${staffName}] 직원의 비밀번호가 '${newPw.trim()}'(으)로 초기화되었습니다.`, 'success');
  } catch (e) {
    Utils.showToast(e.message, 'error');
  }
}
