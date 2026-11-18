/* V11: 문서의 실제 서버 결재 상태를 하나의 결재인으로 표시한다. */
(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const stampInfo = {
    PENDING: {label:'결재 대기',title:'원청 상신',className:'pending'},
    APPROVED: {label:'승인 완료',title:'원청 최종 결재',className:'approved'},
    REJECTED: {label:'반려',title:'원청 결재',className:'rejected'},
    CANCELLED: {label:'승인 취소',title:'원청 결재',className:'cancelled'},
    ARCHIVED: {label:'정리 보관',title:'문서 이력',className:'cancelled'}
  };
  const prettyDate = value => {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value).slice(0,16) : date.toLocaleString('ko-KR', {year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
  };
  function stamp(record,extra='') {
    if (!record) return '';
    const info = stampInfo[record.status] || {label:'상태 확인',title:'문서 결재',className:'cancelled'};
    const who = record.status === 'APPROVED' ? `승인: ${record.approved_by_name || '승인자 확인'}` : record.status === 'PENDING' ? `상신: ${record.submitted_by_name || '상신자 확인'}` : record.status === 'REJECTED' ? '수정 후 재상신 필요' : '결재 이력 확인';
    const when = record.status === 'APPROVED' ? prettyDate(record.approved_at) : record.status === 'PENDING' ? prettyDate(record.submitted_at) : '';
    return `<div class="v11-stamp ${info.className} ${extra}" role="status" aria-label="${escape(info.title)} ${escape(info.label)}"><span>${escape(info.title)}</span><strong>${escape(info.label)}</strong><small>${escape(who)}</small>${when?`<small>${escape(when)}</small>`:''}</div>`;
  }
  function ribbon(record) {
    const host = byId('v9ApprovalRibbon');
    if (!host || !record) return;
    const isManager = typeof v8IsManager === 'function' && v8IsManager();
    const pending = record.status === 'PENDING';
    const approved = record.status === 'APPROVED';
    const rejected = record.status === 'REJECTED';
    const id = Number(record.id);
    host.className = 'v9-approval-ribbon v11-decision-ribbon '+(approved?'approved':pending?'pending':rejected?'rejected':'');
    const direction = pending ? '상신 완료 · 원청 최종 결재만 남았습니다.' : approved ? '결재 처리 완료 · 다시 승인할 필요가 없습니다.' : rejected ? '반려된 문서 · 수정 후 재상신해야 합니다.' : '이전 결재 이력을 확인할 수 있습니다.';
    const actions = pending && isManager ? `<div class="v11-ribbon-action"><button type="button" class="v11-approve" onclick="decideV7Weekly(${id},'APPROVE')">✓ 이 평가서 최종 승인</button><button type="button" class="v11-reject" onclick="decideV7Weekly(${id},'REJECT')">반려</button></div>` : pending ? '<div class="v11-role-note">현장 결재 담당자의 승인을 기다립니다.</div>' : approved ? '<div class="v11-role-note good">✓ 처리 완료 · 결재 버튼 없음</div>' : '';
    host.innerHTML = `<div class="v11-ribbon-message"><b>${escape(String(record.week_start||'').slice(0,10))} 시작 주차 · ${Number(record.revision)||1}차 통합 평가서</b><p>${escape(direction)}</p>${actions}</div>${stamp(record,'ribbon')}`;
  }
  if (window.reviewUi) {
    const originalShow = reviewUi.showWeeklyDetails;
    reviewUi.showWeeklyDetails = function(record,items,events,revisions) {
      originalShow.call(this,record,items,events,revisions);
      if (!record || Number(this.getSelectedWeekly()) !== Number(record.id)) return;
      const header = byId('v7WeeklyDetails')?.querySelector('.v10-doc-header');
      if (header && !header.querySelector('.v11-stamp')) header.insertAdjacentHTML('beforeend',stamp(record,'document'));
      ribbon(record);
    };
    const originalFilter = reviewUi.filterWeekly;
    reviewUi.filterWeekly = function(...args) {
      originalFilter.apply(this,args);
      const rows = typeof v7WeeklyRows === 'undefined' ? [] : v7WeeklyRows;
      byId('v7WeeklyList')?.querySelectorAll('[data-review-id]').forEach(button => {
        const record = rows.find(row => Number(row.id) === Number(button.dataset.reviewId));
        if (!record) return;
        button.dataset.approvalState = record.status;
        const existing = button.querySelector('.v11-list-seal');
        if (existing) existing.remove();
        const info = stampInfo[record.status];
        if (info) button.insertAdjacentHTML('beforeend',`<span class="v11-list-seal ${info.className}">${record.status==='APPROVED'?'✓ ':''}${escape(info.label)}</span>`);
      });
    };
  }
  window.v11Approval = {stamp,stampInfo};
  const release = byId('releaseVersion');
  if (release) release.textContent = 'SAFETY WORKSPACE · V11 / 통합 결재 상태·결재인';
})();
