/* V9 주간 평가서: 테이블 나열 대신 업체별 취합 카드와 최종 승인 상태 바. */
(() => {
  'use strict';
  const $id = id => document.getElementById(id);
  const clean = v => String(v ?? '').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const company = r => r.contractor_name || (r.entry_mode === 'PRIME' ? '원청 자체 작성' : '업체 정보 확인 필요');
  const status = s => ({PENDING:'원청 승인 대기',APPROVED:'원청 최종 승인 완료',REJECTED:'반려 · 수정 필요',CANCELLED:'관리자 승인 취소',ARCHIVED:'정리 보관'}[s] || '상신 전');
  const date = v => String(v || '').slice(0,10) || '-';
  const formatTime = v => { if(!v)return '-';const dt=new Date(v);return Number.isNaN(dt.getTime())?clean(date(v)):clean(dt.toLocaleString('ko-KR')); };
  const isManager = () => typeof v8IsManager === 'function' && v8IsManager();
  const blankRibbon = () => {const host=$id('v9ApprovalRibbon');if(host){host.className='v9-approval-ribbon';host.innerHTML='<span>아래 목록에서 평가서를 선택하면 결재 가능 여부가 표시됩니다.</span>';}};

  // 위험요인 취합: 업체별 작업 카드 — 승인 전에 모든 위험요인을 읽기 쉽게 확인한다.
  window.renderV7Preview = function renderV7Preview() {
    const host=$id('v7WeeklyPreview'),counter=$id('v7PreviewCount');
    if(!host || !counter)return;
    const all=typeof v7Preview!=='undefined' && Array.isArray(v7Preview) ? v7Preview : [];
    const selected=$id('v7CompanyFilter')?.value || '';
    const rows=all.filter(r=>!selected||String(r.contractor_id||-1)===selected);
    const groups=new Map();
    for(const row of rows){
      const key=row.contractor_id ? String(row.contractor_id) : row.entry_mode==='PRIME'?'PRIME':'UNASSIGNED';
      if(!groups.has(key))groups.set(key,{name:company(row),items:[]});
      groups.get(key).items.push(row);
    }
    counter.textContent=`이번 주 위험요인 ${all.length}건 · 현재 ${rows.length}건 표시 · ${groups.size}개 업체/구분`;
    if(!rows.length){host.innerHTML='<div class="v9-preview-empty"><strong>이 주차에 취합할 위험요인이 없습니다.</strong>업체별로 위험성평가를 먼저 작성하거나 조회 주차를 변경해 주세요.</div>';return}
    host.innerHTML=[...groups.values()].map(group=>`<div class="v9-preview-company"><div class="v9-preview-company-title"><strong>${clean(group.name)}</strong><small>위험요인 ${group.items.length}건</small></div>${group.items.map(r=>{
      const riskLevel=r.level==='높음'||Number(r.score)>=6?'high':r.level==='보통'||Number(r.score)>=4?'mid':'';
      const score=[1,2,3].includes(Number(r.frequency))&&[1,2,3].includes(Number(r.severity))?`${Number(r.frequency)} × ${Number(r.severity)} = ${Number(r.score)||Number(r.frequency)*Number(r.severity)}`:'미평가';
      return `<article class="v9-preview-item"><div><strong>${clean(r.work||'작업명 확인 필요')}</strong><div class="v9-preview-author">${clean(r.area||'공종 미기재')} · 작성자 ${clean(r.author_name||'-')}</div></div><span class="v9-risk-chip ${riskLevel}">${clean(r.level||'위험도')} · ${score}</span><div class="v9-preview-field"><span>위험요인</span><p>${clean(r.hazard||'내용 없음')}</p></div><div class="v9-preview-field solution"><span>감소대책</span><p>${clean(r.measure||'대책 확인 필요')}</p></div>${Number(r.id)>0?`<div class="v9-preview-field"><span>첨부자료</span><p><button type="button" class="v9-preview-photo" onclick="openPhotos('risk',${Number(r.id)})">사진 확인 ↗</button></p></div>`:''}</article>`;
    }).join('')}</div>`).join('');
  };

  // 원청 결재는 하나의 평가서 단위로만 한다. 현장관리자에게만 승인/반려 표시.
  function updateRibbon(r){
    const host=$id('v9ApprovalRibbon');if(!host)return;
    if(!r)return blankRibbon();
    const state=r.status||'PENDING',decision=state==='PENDING'&&isManager();
    host.className='v9-approval-ribbon '+(state==='APPROVED'?'approved':state==='REJECTED'?'rejected':state==='PENDING'?'pending':'');
    const who=state==='APPROVED'?`승인자 ${clean(r.approved_by_name||'-')} · ${formatTime(r.approved_at)}`:state==='PENDING'?`상신자 ${clean(r.submitted_by_name||'-')} · ${date(r.week_start)} 시작 주차`:state==='REJECTED'?`반려 사유: ${clean(r.decision_comment||'상세내용 확인 필요')}`:'기존 결재 이력은 보존됩니다.';
    host.innerHTML=`<div><strong class="v9-ribbon-title">${clean(status(state))} · 위험요인 ${Number(r.item_count)||0}건</strong><span class="v9-ribbon-sub">${who}</span></div><div class="v9-ribbon-actions">${decision?`<button type="button" class="approve" onclick="decideV7Weekly(${Number(r.id)},'APPROVE')">✓ 전체 평가서 승인</button><button type="button" class="reject" onclick="decideV7Weekly(${Number(r.id)},'REJECT')">↩ 반려</button>`:state==='APPROVED'?'<span class="v8-status ok">승인 완료 · 이력 보관</span>':state==='REJECTED'?'<span class="v8-status bad">반려 · 재상신 필요</span>':state==='PENDING'?'<span class="v8-status wait">원청 담당자 결재 대기</span>':'<span class="v8-status">문서 이력 조회</span>'}</div>`;
  }
  if(window.reviewUi){
    const oldShow=reviewUi.showWeeklyDetails;
    reviewUi.showWeeklyDetails=function(r,items,events,revisions){oldShow.call(this,r,items,events,revisions);updateRibbon(r)};
    const oldClear=reviewUi.clearWeekly;
    reviewUi.clearWeekly=function(){oldClear.call(this);blankRibbon()};
  }
  const oldTab=window.v7WeeklyTab;
  if(typeof oldTab==='function')window.v7WeeklyTab=function(tab){oldTab(tab);if($id('v7WeeklyTitle'))$id('v7WeeklyTitle').textContent=tab==='completed'?'완료 문서 확인':'주간 평가서 취합 · 상신'};
  const compose=$id('reviewCompose');
  if(compose){compose.addEventListener('toggle',()=>{const span=compose.querySelector('.v9-compose-summary-action');if(span)span.textContent=compose.open?'작성 화면 접기 ↑':'작성 화면 열기 ↓'});}
  // 오래된 브라우저 캐시 / 배포 판본을 화면에서 바로 구별할 수 있다.
  const badge=$id('releaseVersion');if(badge)badge.textContent='SAFETY WORKSPACE · V9 / 주간 평가서 개편';
})();
