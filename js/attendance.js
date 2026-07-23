// js/attendance.js

document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.requireAuth()) return;
  Auth.updateUserUI();

  // Set default date to today
  document.getElementById('attendance-date').value = Utils.formatDate(new Date());

  const user = Auth.getUser();
  // Fetch programs for dropdown
  let teamName = user.role === '관리자' ? '' : user.team; 
  let programs = await ProgramsLogic.loadTeamPrograms(teamName);
  
  // 담당자 기반 필터링 (관리자가 아닐 경우)
  if (user.role !== '관리자') {
    programs = programs.filter(p => p.담당자 && p.담당자.includes(user.name));
  }
  
  let currentProgram = null;
  let currentMembers = [];
  let expandedMemberName = null;

  ProgramsLogic.renderProgramDropdowns(programs, 'dropdowns-container', async (selected) => {
    currentProgram = selected;
    const infoDiv = document.getElementById('selected-program-info');
    const attSection = document.getElementById('attendance-section');
    
    if (selected) {
      infoDiv.classList.remove('hidden');
      attSection.classList.remove('hidden');
      await renderAttendanceSection(selected);
    } else {
      infoDiv.classList.add('hidden');
      attSection.classList.add('hidden');
    }
  });

  async function renderAttendanceSection(program) {
    const countOnlyDiv = document.getElementById('count-only-section');
    const membersDiv = document.getElementById('members-section');
    const unspecDiv = document.getElementById('unspecified-section');
    const manualTypeDiv = document.getElementById('manual-type-selection');
    const manualTypeSelect = document.getElementById('manual-type-select');
    const typeHintDiv = document.getElementById('type-description-hint');
    const dateStr = document.getElementById('attendance-date').value;
    
    if (manualTypeDiv) manualTypeDiv.classList.remove('hidden');

    let existingAtt = [];
    try {
      const attRes = await API.fetchGAS('getAttendanceSheet', { programId: program.사업ID, date: dateStr });
      existingAtt = attRes.data || [];
    } catch (e) {
      console.error('Error fetching attendance sheet:', e);
    }

    // Determine initial type selection based on existing attendance data or program default
    let initialType = '출석부';
    if (existingAtt.some(a => a.이름 === '불특정_인원_입력')) {
      initialType = '불특정';
    } else if (existingAtt.some(a => a.이름 === '건수입력용_무명')) {
      initialType = '건수';
    } else if (existingAtt.some(a => a.이름 !== '건수입력용_무명' && a.이름 !== '불특정_인원_입력')) {
      initialType = '출석부';
    } else {
      // Default from program's default performance type in 사업_마스터
      if (program.실적유형 === '건수' || program.실적유형 === '건수만') {
        initialType = '건수';
      } else if (program.실적유형 === '불특정 인원(실인원, 건수, 연인원)' || program.실적유형 === '불특정') {
        initialType = '불특정';
      } else {
        initialType = '출석부';
      }
    }

    if (manualTypeSelect) {
      manualTypeSelect.value = initialType;
    }

    await switchAttendanceTypeView(initialType, program, dateStr, existingAtt);
  }

  async function switchAttendanceTypeView(typeValue, program, dateStr, existingAtt = null) {
    const countOnlyDiv = document.getElementById('count-only-section');
    const membersDiv = document.getElementById('members-section');
    const unspecDiv = document.getElementById('unspecified-section');
    const typeHintDiv = document.getElementById('type-description-hint');

    if (countOnlyDiv) countOnlyDiv.classList.add('hidden');
    if (membersDiv) membersDiv.classList.add('hidden');
    if (unspecDiv) unspecDiv.classList.add('hidden');

    if (!existingAtt && program) {
      try {
        const attRes = await API.fetchGAS('getAttendanceSheet', { programId: program.사업ID, date: dateStr });
        existingAtt = attRes.data || [];
      } catch (e) {
        existingAtt = [];
      }
    }

    if (typeValue === '건수') {
      if (countOnlyDiv) countOnlyDiv.classList.remove('hidden');
      if (typeHintDiv) typeHintDiv.textContent = '💡 실적 건수만 수량(숫자)으로 직접 입력합니다. (예: 협약 체결 건수, 물품 지원 건수 등)';
      
      const countAtt = (existingAtt || []).find(a => a.이름 === '건수입력용_무명');
      const countInput = document.getElementById('input-count');
      if (countInput) countInput.value = countAtt ? (countAtt.건수 || 0) : 0;

    } else if (typeValue === '불특정') {
      if (unspecDiv) unspecDiv.classList.remove('hidden');
      if (typeHintDiv) typeHintDiv.textContent = '💡 행사/축제 참여자 등 불특정 다수의 실인원, 건수, 연인원을 입력합니다. (신규 참여자만 실인원에 반영)';

      const unspecAtt = (existingAtt || []).find(a => a.이름 === '불특정_인원_입력');
      const realVal = unspecAtt ? (unspecAtt.실인원 || 0) : 0;
      const checkEl = document.getElementById('unspec-apply-real-check');
      const realInput = document.getElementById('unspec-real');
      
      if (checkEl) {
        checkEl.checked = realVal > 0 || !unspecAtt;
      }
      if (realInput) {
        realInput.value = realVal;
        realInput.disabled = checkEl && !checkEl.checked;
      }

      document.getElementById('unspec-count').value = unspecAtt ? (unspecAtt.건수 || 0) : 0;
      document.getElementById('unspec-accum').value = unspecAtt ? (unspecAtt.연인원 || 0) : 0;
      document.getElementById('unspec-staff').value = unspecAtt ? (unspecAtt.세부_직원 || 0) : 0;
      document.getElementById('unspec-disabled').value = unspecAtt ? (unspecAtt.세부_장애인 || 0) : 0;
      document.getElementById('unspec-nondisabled').value = unspecAtt ? (unspecAtt.세부_비장애인 || 0) : 0;
      document.getElementById('unspec-remark').value = unspecAtt ? (unspecAtt.비고 || '') : '';

      if (checkEl && !checkEl.dataset.hasListener) {
        checkEl.dataset.hasListener = 'true';
        checkEl.addEventListener('change', (e) => {
          if (!e.target.checked) {
            realInput.dataset.prevVal = realInput.value;
            realInput.value = 0;
            realInput.disabled = true;
          } else {
            realInput.disabled = false;
            realInput.value = realInput.dataset.prevVal || document.getElementById('unspec-accum').value || 0;
          }
        });
      }

    } else { // '출석부'
      if (membersDiv) membersDiv.classList.remove('hidden');
      if (typeHintDiv) typeHintDiv.textContent = '💡 참석자/회원 명단에서 개인별 출석을 체크합니다. (실인원, 건수, 연인원 자동 합산)';

      // Fetch members for the program
      try {
        const teamName = user.role === '관리자' ? '' : user.team;
        const res = await API.fetchGAS('getMembers', { programId: 'all', status: '활성', teamName });
        const rawMembers = res.data || [];
        // 이름이 비어있는 무효/유령 회원 사전 완벽 제거
        const validMembers = rawMembers.filter(m => m && m.이름 && String(m.이름).trim() !== '');
        
        if (program.사업명) {
          const normSearch = String(program.사업명).replace(/\s+/g, '');
          const normTeam = String(program.팀명 || '').replace(/\s+/g, '');

          currentMembers = validMembers.filter(m => {
            const mProgStr = String(m.사업명 || '').replace(/\s+/g, '');
            const mTeamStr = String(m.팀명 || '').replace(/\s+/g, '');

            // 회원의 사업명이 등록되어 있는 경우
            if (mProgStr !== '') {
              // 쉼표나 빗금으로 구분된 사업명 분할 매칭
              const progTokens = mProgStr.split(/[,/]/).map(t => t.trim()).filter(Boolean);
              return progTokens.some(pt => pt.includes(normSearch) || normSearch.includes(pt));
            }
            
            // 회원의 사업명이 없는 경우: 팀명이 일치하는지 확인
            if (mTeamStr !== '' && normTeam !== '') {
              return mTeamStr === normTeam;
            }

            return false;
          });
        } else {
          currentMembers = validMembers;
        }
        
        const attList = existingAtt || [];
        updateSessionSummary(attList);

        const sessionRoundSelect = document.getElementById('session-round-select');
        const selectedRound = sessionRoundSelect ? sessionRoundSelect.value.trim() : '1회차(정규)';

        function isAttMatchSession(att, targetRound) {
          const match = String(att.비고 || '').match(/\[회차:\s*([^\]]+)\]/);
          const attRound = match ? match[1].trim() : '1회차(정규)';
          return attRound === targetRound || (targetRound.startsWith('1회차') && !match);
        }

        const currentRoundAttList = attList.filter(a => isAttMatchSession(a, selectedRound));

        // 과거 출석 기록에 있는 회원 추가 (무효 무명 및 불특정 인원 제외)
        currentRoundAttList.forEach(att => {
          if (att.이름 && String(att.이름).trim() !== '' && 
              att.이름 !== '건수입력용_무명' && att.이름 !== '불특정_인원_입력' &&
              !currentMembers.find(m => m.이름 === att.이름)) {
            currentMembers.push({
              이름: att.이름,
              장애비장애구분: '비장애',
              attended: att.출석여부 === 'O'
            });
          }
        });

        currentMembers.forEach(m => {
          const att = currentRoundAttList.find(a => a.이름 === m.이름);
          if (att) {
            m.attended = (att.출석여부 === 'O');
            m.count = Number(att.건수) || (m.attended ? 1 : 0);
            let remarkText = att.비고 || '';
            // [회차:...] 태그 제거 후 표시용 비고 파싱
            remarkText = remarkText.replace(/\[회차:\s*[^\]]+\]\s*/g, '');
            if (remarkText.startsWith('결석사유:')) {
              const parts = remarkText.split(' / ');
              m.absenceReason = parts[0].replace(/^결석사유:\s*/, '').trim();
              m.remark = parts.slice(1).join(' / ');
            } else {
              m.absenceReason = '';
              m.remark = remarkText;
            }
          } else {
            m.attended = false;
            m.count = 1;
            m.absenceReason = '';
            m.remark = '';
          }
        });

        populateGroupFilterOptions(currentMembers);
        renderMembersGrid();
      } catch (e) {
        console.error('Error fetching members or attendance:', e);
        Utils.showToast('데이터를 불러오는 중 오류가 발생했습니다: ' + e.message, 'error');
        currentMembers = [];
        renderMembersGrid();
      }
    }
  }

  function populateGroupFilterOptions(members) {
    const groupSelect = document.getElementById('group-filter-select');
    if (!groupSelect) return;
    
    const existingVal = groupSelect.value;
    const groupSet = new Set();
    members.forEach(m => {
      const g = (m.그룹구분 || m['그룹/반 구분'] || m['그룹구분'] || '').trim();
      if (g) groupSet.add(g);
    });

    let optionsHtml = '<option value="all">전체 그룹/반 보기</option>';
    Array.from(groupSet).sort().forEach(g => {
      optionsHtml += `<option value="${g}">${g}</option>`;
    });
    groupSelect.innerHTML = optionsHtml;
    if (existingVal && Array.from(groupSet).includes(existingVal)) {
      groupSelect.value = existingVal;
    }
  }

  function updateSessionSummary(attList) {
    const summaryBar = document.getElementById('session-summary-bar');
    const summaryContent = document.getElementById('session-summary-content');
    if (!summaryBar || !summaryContent) return;

    if (!attList || attList.length === 0) {
      summaryBar.classList.add('hidden');
      return;
    }

    const roundsMap = {};
    attList.forEach(a => {
      if (a.출석여부 === 'O' && a.이름 !== '건수입력용_무명' && a.이름 !== '불특정_인원_입력') {
        const match = String(a.비고 || '').match(/\[회차:\s*([^\]]+)\]/);
        const roundName = match ? match[1].trim() : '1회차(정규)';
        roundsMap[roundName] = (roundsMap[roundName] || 0) + 1;
      }
    });

    const keys = Object.keys(roundsMap);
    if (keys.length === 0) {
      summaryBar.classList.add('hidden');
      return;
    }

    summaryBar.classList.remove('hidden');
    summaryContent.innerHTML = keys.map(k => `
      <span class="badge badge-primary" style="font-size:12px; margin-right:4px;">
        ${k}: <strong>${roundsMap[k]}명 출석</strong>
      </span>
    `).join('');
  }

  function renderMembersGrid(filter = '') {
    const grid = document.querySelector('#members-grid');
    if (!grid) return;
    grid.innerHTML = '';
    
    let filtered = currentMembers.filter(m => m && m.이름 && String(m.이름).trim() !== '');
    
    // 0. 그룹/반 필터 적용
    const groupFilterEl = document.getElementById('group-filter-select');
    const groupFilterVal = groupFilterEl ? groupFilterEl.value : 'all';
    if (groupFilterVal && groupFilterVal !== 'all') {
      filtered = filtered.filter(m => {
        const gStr = String(m.그룹구분 || m['그룹/반 구분'] || '').trim();
        return gStr === groupFilterVal;
      });
    }

    // 1. 요일별 필터 적용 (대한민국 시간 기준 선택 일자의 요일에 맞는 이용인 명단 자동 분류)
    const dateVal = document.getElementById('attendance-date') ? document.getElementById('attendance-date').value : '';
    let currentDayName = '';
    if (dateVal) {
      const parts = dateVal.split('-');
      if (parts.length === 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const d = parseInt(parts[2], 10);
        const daysMap = ['일', '월', '화', '수', '목', '금', '토'];
        currentDayName = daysMap[new Date(y, m, d).getDay()];
      }
    }

    const dayFilterEl = document.getElementById('day-filter-select');
    const dayFilterVal = dayFilterEl ? dayFilterEl.value : 'auto';

    let targetDay = null;
    if (dayFilterVal === 'auto') {
      targetDay = currentDayName;
    } else if (dayFilterVal !== 'all') {
      targetDay = dayFilterVal;
    }

    if (targetDay) {
      filtered = filtered.filter(m => {
        const rawDays = String(m.요일 || '전체').trim();
        if (!rawDays || rawDays === '전체' || rawDays === '매일' || rawDays === 'all') return true;
        return rawDays.includes(targetDay);
      });
    }

    // 2. 이름 검색 필터 적용
    if (filter) {
      filtered = filtered.filter(m => m.이름.includes(filter));
    }
    
    let attCount = filtered.filter(m => m.attended).length;
    let absCount = filtered.filter(m => !m.attended).length;
    const dayTagStr = targetDay ? ` (${targetDay}요일 이용인)` : '';
    const groupTagStr = (groupFilterVal && groupFilterVal !== 'all') ? ` [${groupFilterVal}]` : '';
    document.getElementById('attendance-counter').textContent = `출석 ${attCount}명 / 결석 ${absCount}명 (전체 ${filtered.length}명${dayTagStr}${groupTagStr})`;

    if (filtered.length === 0) {
      grid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 20px;">회원이 없습니다.</div>';
      return;
    }

    const fragment = document.createDocumentFragment();
    filtered.forEach((m) => {
      const isExpanded = (expandedMemberName === m.이름);
      const countVal = m.count || 1;
      const card = document.createElement('div');
      card.className = `att-card ${m.attended ? 'attended' : ''} ${isExpanded ? 'expanded' : ''}`;
      card.setAttribute('data-name', m.이름);
      
      let badgeHtml = '';
      if (m.attended) {
        badgeHtml = `<span class="badge" style="background:var(--color-primary); color:white; font-size:11px; padding:2px 6px; border-radius:10px; margin-left:6px;">O 출석${countVal > 1 ? ` (${countVal}회)` : ''}</span>`;
      } else if (m.absenceReason) {
        badgeHtml = `<span class="badge" style="background:var(--color-error); color:white; font-size:11px; padding:2px 6px; border-radius:10px; margin-left:6px;">X 결석 (${m.absenceReason})</span>`;
      }

      let groupBadgeHtml = '';
      const groupDivStr = m.그룹구분 || m['그룹/반 구분'] || '';
      if (groupDivStr) {
        groupBadgeHtml = `<span class="badge" style="font-size:10px; padding:2px 5px; margin-left:4px; background:#E2E8F0; color:#334155; border-radius:8px;">🏷️ ${groupDivStr}</span>`;
      }

      card.innerHTML = `
        <div class="name-display flex justify-between items-center" style="width:100%;">
          <span><strong>${m.이름}</strong> ${groupBadgeHtml} ${badgeHtml}</span>
          ${m.attended ? `<button class="btn-ghost btn-inc-count" data-name="${m.이름}" style="padding:2px 6px; font-size:11px; border:1px solid var(--color-primary); color:var(--color-primary);" title="당일 2회 이상 출석 시 1회 추가">+1회 (보강)</button>` : ''}
        </div>

        <div class="expanded-content mt-2">
          ${!m.attended ? `
            <div class="mb-2 p-2 rounded" style="background: rgba(239, 68, 68, 0.06); border: 1px solid rgba(239, 68, 68, 0.2);">
              <label class="form-label" style="font-size:11px; font-weight:bold; color:var(--color-error);">⚠️ 결석 사유 입력</label>
              <div class="flex gap-1 mt-1">
                <select class="form-select absence-select" data-name="${m.이름}" style="font-size:12px; max-width:120px;">
                  <option value="">사유 선택</option>
                  <option value="개인사정" ${m.absenceReason === '개인사정' ? 'selected' : ''}>개인사정</option>
                  <option value="질병/병가" ${m.absenceReason === '질병/병가' ? 'selected' : ''}>질병/병가</option>
                  <option value="가정사정" ${m.absenceReason === '가정사정' ? 'selected' : ''}>가정사정</option>
                  <option value="무단결석" ${m.absenceReason === '무단결석' ? 'selected' : ''}>무단결석</option>
                </select>
                <input type="text" class="form-input absence-input" data-name="${m.이름}" placeholder="상세 사유 (예: 감기)" value="${m.absenceReason || ''}" style="font-size:12px;">
              </div>
            </div>
          ` : `
            <div class="mb-2 flex items-center justify-between" style="font-size:12px; background:rgba(59,130,246,0.06); padding:4px 8px; border-radius:4px;">
              <span>당일 출석 횟수 (건수): <strong>${countVal}회</strong></span>
              <div>
                <button class="btn-ghost btn-set-count" data-name="${m.이름}" data-cnt="1" style="padding:2px 6px; font-size:11px;">1회(정규)</button>
                <button class="btn-ghost btn-set-count" data-name="${m.이름}" data-cnt="2" style="padding:2px 6px; font-size:11px;">2회(보강)</button>
              </div>
            </div>
          `}

          <input type="text" class="form-input remark-input" data-name="${m.이름}" placeholder="특이사항(비고) 입력" value="${m.remark || ''}" style="font-size:12px;">
          <div class="att-card-actions mt-2 flex gap-1">
            <button class="btn-ghost btn-cancel-att" data-name="${m.이름}" style="flex:1; border: 1px solid #ccc; font-size:12px;">${m.attended ? '출석 취소 (결석 전환)' : '출석 처리'}</button>
            <button class="btn-error btn-delete-member" data-name="${m.이름}" style="flex:1; font-size:12px;">명단 삭제</button>
          </div>
        </div>
      `;
      fragment.appendChild(card);
    });
    grid.appendChild(fragment);

    // Event Delegation for Grid Interactions
    grid.querySelectorAll('.att-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || e.target.tagName === 'SELECT') return;
        
        const memberName = card.getAttribute('data-name');
        const member = currentMembers.find(m => m.이름 === memberName);
        if (!member) return;

        if (!member.attended) {
          member.attended = true;
          member.count = 1;
          expandedMemberName = null;
          renderMembersGrid(filter);
        } else {
          expandedMemberName = (expandedMemberName === memberName) ? null : memberName;
          renderMembersGrid(filter);
        }
      });
    });

    // Increment count button (+1회 보강)
    grid.querySelectorAll('.btn-inc-count').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const memberName = e.target.getAttribute('data-name');
        const member = currentMembers.find(m => m.이름 === memberName);
        if (member) {
          member.count = (member.count || 1) + 1;
          Utils.showToast(`[${member.이름}] 당일 출석 횟수가 ${member.count}회로 설정되었습니다.`, 'info');
          renderMembersGrid(filter);
        }
      });
    });

    // Set count button (1회 / 2회)
    grid.querySelectorAll('.btn-set-count').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const memberName = e.target.getAttribute('data-name');
        const cnt = parseInt(e.target.getAttribute('data-cnt'), 10) || 1;
        const member = currentMembers.find(m => m.이름 === memberName);
        if (member) {
          member.count = cnt;
          renderMembersGrid(filter);
        }
      });
    });

    // Absence Select & Input
    grid.querySelectorAll('.absence-select').forEach(sel => {
      sel.addEventListener('change', (e) => {
        const memberName = e.target.getAttribute('data-name');
        const member = currentMembers.find(m => m.이름 === memberName);
        if (member) {
          member.absenceReason = e.target.value;
          const customInput = grid.querySelector(`.absence-input[data-name="${memberName}"]`);
          if (customInput && e.target.value !== '' && e.target.value !== '기타') {
            customInput.value = e.target.value;
          }
          renderMembersGrid(filter);
        }
      });
    });

    grid.querySelectorAll('.absence-input').forEach(input => {
      input.addEventListener('input', (e) => {
        const memberName = e.target.getAttribute('data-name');
        const member = currentMembers.find(m => m.이름 === memberName);
        if (member) {
          member.absenceReason = e.target.value;
        }
      });
    });

    // Remark inputs
    grid.querySelectorAll('.remark-input').forEach(input => {
      input.addEventListener('input', (e) => {
        const memberName = e.target.getAttribute('data-name');
        const member = currentMembers.find(m => m.이름 === memberName);
        if (member) member.remark = e.target.value;
      });
    });

    // Cancel / Toggle Attendance Button
    grid.querySelectorAll('.btn-cancel-att').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const memberName = e.target.getAttribute('data-name');
        const member = currentMembers.find(m => m.이름 === memberName);
        if (member) {
          member.attended = !member.attended;
          if (member.attended) member.count = 1;
          expandedMemberName = memberName;
          renderMembersGrid(filter);
        }
      });
    });

    // Delete Member Button
    grid.querySelectorAll('.btn-delete-member').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        if (!confirm('해당 회원을 정말 삭제하시겠습니까? (즉시 서버에 반영됩니다)')) return;
        const memberName = e.target.getAttribute('data-name');
        const dateStr = document.getElementById('attendance-date').value;
        const programId = currentProgram.사업ID;
        
        try {
          await API.fetchGAS('deleteAttendanceMember', { programId, date: dateStr, memberName });
          Utils.showToast('삭제되었습니다.', 'success');
          // Reload attendance table to reflect real-time status
          renderAttendanceSection(currentProgram);
        } catch (err) {
          Utils.showToast('삭제 중 오류가 발생했습니다.', 'error');
        }
      });
    });
  }

  // Absence Modal listener
  const viewAbsBtn = document.getElementById('btn-view-absences');
  if (viewAbsBtn && !viewAbsBtn.dataset.hasListener) {
    viewAbsBtn.dataset.hasListener = 'true';
    viewAbsBtn.addEventListener('click', () => {
      const absentMembers = currentMembers.filter(m => !m.attended);
      const container = document.getElementById('absence-list-container');
      const modal = document.getElementById('absence-modal');
      
      if (absentMembers.length === 0) {
        container.innerHTML = '<p class="text-center" style="padding:20px; color:var(--color-primary-dark); font-weight:bold;">🎉 선택 일자의 결석 아동이 없습니다. (전원 출석!)</p>';
      } else {
        container.innerHTML = `
          <table class="table-glass" style="width:100%; font-size:13px;">
            <thead>
              <tr>
                <th style="padding:6px; color:var(--color-primary-dark);">이름</th>
                <th style="padding:6px; color:var(--color-primary-dark);">상태</th>
                <th style="padding:6px; color:var(--color-primary-dark);">결석 사유</th>
              </tr>
            </thead>
            <tbody>
              ${absentMembers.map(m => `
                <tr>
                  <td style="padding:6px;"><strong>${m.이름}</strong></td>
                  <td style="padding:6px;"><span style="color:var(--color-error); font-weight:bold;">결석</span></td>
                  <td style="padding:6px; color:var(--color-text);">${m.absenceReason ? m.absenceReason : '<span style="color:#aaa;">(사유 미입력)</span>'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `;
      }
      modal.classList.add('active');
    });
  }

  const sessionRoundSelect = document.getElementById('session-round-select');
  if (sessionRoundSelect && !sessionRoundSelect.dataset.hasListener) {
    sessionRoundSelect.dataset.hasListener = 'true';
    sessionRoundSelect.addEventListener('change', async (e) => {
      const selectedRound = e.target.value;
      
      // 회차/시간대 선택 시 해당 그룹/반 스마트 매칭
      const groupSelect = document.getElementById('group-filter-select');
      if (groupSelect && groupSelect.options.length > 1) {
        let matchedVal = 'all';
        const numMatch = selectedRound.match(/\d+/);
        const searchKeyword = numMatch ? numMatch[0] : '';
        const roundNumMatch = selectedRound.match(/(\d+)회차/);
        const roundNumStr = roundNumMatch ? `그룹${roundNumMatch[1]}` : '';

        for (let i = 1; i < groupSelect.options.length; i++) {
          const optVal = groupSelect.options[i].value;
          if ((searchKeyword && searchKeyword.length >= 2 && optVal.includes(searchKeyword)) || (roundNumStr && optVal.includes(roundNumStr))) {
            matchedVal = optVal;
            break;
          }
        }
        groupSelect.value = matchedVal;
      }

      if (currentProgram) {
        await renderAttendanceSection(currentProgram);
      }
      Utils.showToast(`[${selectedRound}] 출석 화면으로 전환되었습니다.`, 'info');
    });
  }

  const groupFilterSelect = document.getElementById('group-filter-select');
  if (groupFilterSelect && !groupFilterSelect.dataset.hasListener) {
    groupFilterSelect.dataset.hasListener = 'true';
    groupFilterSelect.addEventListener('change', () => {
      renderMembersGrid();
    });
  }

  const dayFilterSelect = document.getElementById('day-filter-select');
  if (dayFilterSelect && !dayFilterSelect.dataset.hasListener) {
    dayFilterSelect.dataset.hasListener = 'true';
    dayFilterSelect.addEventListener('change', () => {
      renderMembersGrid();
    });
  }

  document.getElementById('search-member').addEventListener('input', (e) => {
    renderMembersGrid(e.target.value);
  });

  document.getElementById('btn-check-all').addEventListener('click', () => {
    currentMembers.forEach(m => { m.attended = true; m.count = 1; });
    renderMembersGrid();
  });

  document.getElementById('btn-uncheck-all').addEventListener('click', () => {
    currentMembers.forEach(m => m.attended = false);
    renderMembersGrid();
  });

  document.getElementById('attendance-date').addEventListener('change', async () => {
    if (currentProgram) await renderAttendanceSection(currentProgram);
  });

  const manualSelect = document.getElementById('manual-type-select');
  if (manualSelect) {
    manualSelect.addEventListener('change', async (e) => {
      if (currentProgram) {
        const dateStr = document.getElementById('attendance-date').value;
        await switchAttendanceTypeView(e.target.value, currentProgram, dateStr);
      }
    });
  }

  const btnToggleUnspec = document.getElementById('btn-toggle-unspec-details');
  if (btnToggleUnspec) {
    btnToggleUnspec.addEventListener('click', (e) => {
      e.preventDefault();
      const detailsDiv = document.getElementById('unspec-details');
      if (detailsDiv) {
        if (detailsDiv.classList.contains('hidden')) {
          detailsDiv.classList.remove('hidden');
          btnToggleUnspec.textContent = '- 세부내용 닫기';
        } else {
          detailsDiv.classList.add('hidden');
          btnToggleUnspec.textContent = '+ 세부내용 추가';
        }
      }
    });
  }

  // Auto-sum logic for unspecified details to accumCount
  const unspecInputs = ['unspec-staff', 'unspec-disabled', 'unspec-nondisabled'];
  unspecInputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', () => {
        const staff = parseInt(document.getElementById('unspec-staff').value, 10) || 0;
        const disabled = parseInt(document.getElementById('unspec-disabled').value, 10) || 0;
        const nondisabled = parseInt(document.getElementById('unspec-nondisabled').value, 10) || 0;
        const total = staff + disabled + nondisabled;
        
        if (total > 0) {
          document.getElementById('unspec-accum').value = total;
        }
      });
    }
  });

  // Save functionality
  document.getElementById('btn-save').addEventListener('click', async () => {
    if (!currentProgram) return;
    const dateStr = document.getElementById('attendance-date').value;
    const manualTypeSelect = document.getElementById('manual-type-select');
    const selectedType = manualTypeSelect ? manualTypeSelect.value : '출석부';

    try {
      if (selectedType === '건수') {
        const count = document.getElementById('input-count').value;
        await API.fetchGAS('submitCountOnly', { programId: currentProgram.사업ID, date: dateStr, count: parseInt(count, 10) });
      } else if (selectedType === '불특정') {
        const applyRealCheck = document.getElementById('unspec-apply-real-check');
        const isRealChecked = !applyRealCheck || applyRealCheck.checked;
        const data = {
          realCount: isRealChecked ? (parseInt(document.getElementById('unspec-real').value, 10) || 0) : 0,
          count: parseInt(document.getElementById('unspec-count').value, 10) || 0,
          accumCount: parseInt(document.getElementById('unspec-accum').value, 10) || 0,
          staffCount: parseInt(document.getElementById('unspec-staff').value, 10) || 0,
          disabledCount: parseInt(document.getElementById('unspec-disabled').value, 10) || 0,
          nonDisabledCount: parseInt(document.getElementById('unspec-nondisabled').value, 10) || 0,
          remark: document.getElementById('unspec-remark').value || ''
        };
        await API.fetchGAS('submitUnspecifiedAttendance', { programId: currentProgram.사업ID, date: dateStr, data: data });
      } else {
        const sessionRound = document.getElementById('session-round-select') ? document.getElementById('session-round-select').value : '1회차(정규)';
        const attendanceList = currentMembers.map(m => {
          let finalRemark = m.remark || '';
          if (!m.attended && m.absenceReason) {
            finalRemark = '결석사유: ' + m.absenceReason + (m.remark ? ' / ' + m.remark : '');
          }
          return {
            이름: m.이름,
            출석여부: m.attended ? 'O' : 'X',
            건수: m.attended ? (m.count || 1) : 0,
            비고: finalRemark
          };
        });
        await API.fetchGAS('checkAttendance', { programId: currentProgram.사업ID, date: dateStr, attendanceList, sessionRound });
      }
      if (window.APICache && typeof APICache.clearAll === 'function') {
        APICache.clearAll();
      }
      Utils.showToast('출석 및 실적이 성공적으로 저장되었습니다.', 'success');
      if (currentProgram) {
        await renderAttendanceSection(currentProgram);
      }
    } catch (e) {
      console.error('Save attendance error:', e);
      Utils.showToast('저장 중 오류가 발생했습니다: ' + (e.message || e), 'error');
    }
  });

  // QR Code Generation
  document.getElementById('btn-show-qr').addEventListener('click', async () => {
    if (!currentProgram) return;
    const dateStr = document.getElementById('attendance-date').value;
    
    try {
      const res = await API.fetchGAS('getQRToken', { programId: currentProgram.사업ID, date: dateStr });
      const token = res.data.token;
      
      const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/'));
      const qrUrl = `${baseUrl}/qr-checkin.html?token=${token}&program=${currentProgram.사업ID}&date=${dateStr}`;
      
      document.getElementById('qrcode').innerHTML = '';
      new QRCode(document.getElementById('qrcode'), {
        text: qrUrl,
        width: 200,
        height: 200
      });
      
      document.getElementById('qr-link').href = qrUrl;
      document.getElementById('qr-modal').classList.add('active');
    } catch (e) {}
  });

  // Kiosk Mode Logic
  let kioskMode = false;
  let selectedKioskMember = null;

  document.getElementById('btn-enter-kiosk').addEventListener('click', () => {
    if (!currentProgram) return Utils.showToast('사업을 먼저 선택해주세요.', 'error');
    kioskMode = true;
    selectedKioskMember = null;
    document.querySelector('.app-container').classList.add('hidden');
    document.getElementById('kiosk-overlay').classList.remove('hidden');
    document.getElementById('kiosk-title').textContent = `${currentProgram.사업명} 출석체크`;
    renderKioskGrid();
  });

  document.getElementById('btn-exit-kiosk').addEventListener('click', () => {
    kioskMode = false;
    document.getElementById('kiosk-overlay').classList.add('hidden');
    document.querySelector('.app-container').classList.remove('hidden');
    renderAttendanceSection(currentProgram); // Refresh staff UI
  });

  function renderKioskGrid() {
    const grid = document.getElementById('kiosk-grid');
    grid.innerHTML = '';
    
    const saveBtn = document.getElementById('btn-kiosk-save');
    if (selectedKioskMember) {
      saveBtn.disabled = false;
      saveBtn.textContent = `${selectedKioskMember}님 출석 저장하기`;
    } else {
      saveBtn.disabled = true;
      saveBtn.textContent = `이름을 선택해주세요`;
    }

    const fragment = document.createDocumentFragment();
    currentMembers.forEach(m => {
      const card = document.createElement('div');
      const isSelected = (selectedKioskMember === m.이름);
      
      if (m.attended) {
        card.className = 'kiosk-card attended';
        card.innerHTML = `
          <div>${m.이름}</div>
          <div style="font-size:14px; font-weight: 500; display:flex; align-items:center; gap:4px;">
            <span style="color:var(--color-success); font-size: 16px;">✅</span> 출석 완료
          </div>
        `;
      } else {
        card.className = `kiosk-card ${isSelected ? 'selected' : ''}`;
        card.innerHTML = `<div>${m.이름}</div>`;
        card.addEventListener('click', () => {
          selectedKioskMember = m.이름;
          renderKioskGrid();
        });
      }
      fragment.appendChild(card);
    });
    grid.appendChild(fragment);
  }

  document.getElementById('btn-kiosk-save').addEventListener('click', async () => {
    if (!selectedKioskMember) return;
    const memberName = selectedKioskMember;
    const dateStr = document.getElementById('attendance-date').value;
    const programId = currentProgram.사업ID;
    
    document.getElementById('btn-kiosk-save').disabled = true;
    document.getElementById('btn-kiosk-save').textContent = '저장 중...';
    
    try {
      await API.fetchGAS('kioskCheckIn', { programId, date: dateStr, memberName });
      alert(`${memberName}님 출석 완료 되었습니다.`);
      
      const m = currentMembers.find(x => x.이름 === memberName);
      if (m) m.attended = true;
      
      selectedKioskMember = null;
      renderKioskGrid();
    } catch (err) {
      alert(`오류: ${err.message}`);
      document.getElementById('btn-kiosk-save').disabled = false;
      document.getElementById('btn-kiosk-save').textContent = `${memberName}님 출석 저장하기`;
    }
  });
});
