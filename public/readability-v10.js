/* V10 읽기 쉬운 결재 상세: 문서 > 위험요인 > 결재 > 세부 이력 순서. */
(() => {
  'use strict';
  const byId=id=>document.getElementById(id);
  const clean=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const day=v=>String(v||'').slice(0,10)||'-';
  const dateTime=v=>{if(!v)return '-';const d=new Date(v);return Number.isNaN(d.getTime())?clean(day(v)):clean(d.toLocaleString('ko-KR'))};
  const statusText={PENDING:'승인 대기',APPROVED:'승인 완료',REJECTED:'반려',CANCELLED:'승인 취소',ARCHIVED:'정리 보관'};
  const company=x=>x.contractor_name||(x.entry_mode==='PRIME'?'원청 자체 작성':'업체 정보 확인 필요');
  const prettyWeek=dayValue=>{const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(dayValue);return match?`${match[1]}년 ${Number(match[2])}월 ${Math.floor((Number(match[3])-1)/7)+1}주차`:'주간 위험성평가'};
  const weekPeriod=start=>{const s=day(start);if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return '-';const d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+6);return `${s} ~ ${d.toISOString().slice(0,10)}`};
  const site=()=>{const list=typeof sites!=='undefined'?sites:[];return list.find(s=>String(s.id)===String(typeof sid!=='undefined'?sid:''))?.name||'선택 현장'};
  const metric=(title,value,sub,kind='')=>`<div class="v10-glance-item ${kind}"><span>${clean(title)}</span><strong>${clean(value)}</strong><small>${clean(sub)}</small></div>`;
  const field=(title,value)=>`<div class="v10-info-field"><dt>${clean(title)}</dt><dd>${clean(value||'-')}</dd></div>`;
  const riskLevel=r=>{const score=Number(r.score)||Number(r.frequency)*Number(r.severity)||0;return r.level==='높음'||score>=6?'high':r.level==='보통'||score>=4?'mid':'low'};
  const stateClass=s=>s==='APPROVED'?'approved':s==='REJECTED'?'rejected':s==='CANCELLED'?'cancelled':'pending';

  function riskCard(r,number){
    const score=Number(r.score)||Number(r.frequency)*Number(r.severity)||0,kind=riskLevel(r);
    const riskText={high:'고위험',mid:'보통',low:'낮음'}[kind];
    const id=Number(r.id);
    return `<article class="v10-risk-card ${kind}"><div class="v10-risk-card-top"><div class="v10-risk-identity"><span class="v10-risk-number">${String(number).padStart(2,'0')}</span><div><h4>${clean(r.work||'작업명 확인 필요')}</h4><p>${clean(company(r))}${r.area?' · '+clean(r.area):''}</p></div></div><span class="v10-risk-level ${kind}">${riskText} · ${score}점</span></div><div class="v10-risk-hazard"><span class="v10-risk-label">위험요인</span><strong>${clean(r.hazard||'위험요인을 확인해 주세요.')}</strong></div><div class="v10-risk-solution"><span class="v10-risk-label">감소대책</span><p>${clean(r.measure||'등록된 감소대책이 없습니다.')}</p></div><div class="v10-risk-foot"><span>작성자 ${clean(r.author_name||'-')} · 빈도 ${Number(r.frequency)||'-'} × 강도 ${Number(r.severity)||'-'}</span>${Number.isSafeInteger(id)&&id>0?`<button type="button" class="v10-photo-button" onclick="openPhotos('risk',${id})">사진 확인 ↗</button>`:''}</div></article>`;
  }

  function detail(r,items){
    const rows=Array.isArray(items)?items:[];
    const sorted=[...rows].sort((a,b)=>(Number(b.score)||0)-(Number(a.score)||0));
    const participating=new Set(rows.map(x=>x.contractor_id?String(x.contractor_id):x.entry_mode==='PRIME'?'PRIME':'UNASSIGNED')).size;
    const high=rows.filter(x=>riskLevel(x)==='high').length;
    const status=r.status||'PENDING';
    const title=prettyWeek(day(r.week_start));
    const topText=status==='APPROVED'?`최종 승인 ${dateTime(r.approved_at)}`:status==='PENDING'?`원청 담당자 승인 대기 중`:status==='REJECTED'?'반려 내용을 확인하고 수정 후 재상신하세요.':'결재 이력 확인';
    const stateNote=status==='APPROVED'?`<div class="v10-doc-notice ok"><strong>✓ 최종 승인 완료</strong><span>${clean(r.approved_by_name||'승인자 미기록')} · ${dateTime(r.approved_at)}에 승인됐습니다.</span></div>`:status==='REJECTED'?`<div class="v10-doc-notice rejected"><strong>↩ 평가서 반려</strong><span>${clean(r.decision_comment||'반려 사유를 확인해 주세요.')}</span>${typeof v8IsManager==='function'&&v8IsManager()?`<button type="button" onclick="v8ReloadRejected('${clean(day(r.week_start))}')">수정·재상신 준비 →</button>`:''}</div>`:status==='CANCELLED'?`<div class="v10-doc-notice neutral"><strong>승인·상신 취소 이력</strong><span>${clean(r.cancelled_by_name||'최고관리자')} · ${clean(r.cancel_reason||'취소 사유 확인 필요')} · 기존 승인 기록은 보존됩니다.</span></div>`:'';
    const details=field('평가기간',weekPeriod(r.week_start))+field('상신자',r.submitted_by_name||'미기록')+field('상신일시',dateTime(r.submitted_at))+field('회의일',day(r.meeting_date))+field('참석자·업체',r.attendees||'미입력')+field('최종 승인자',r.approved_by_name||'승인 전')+field('승인일시',dateTime(r.approved_at))+field('회의 검토 의견',r.meeting_notes||'입력된 내용 없음');
    return `<div class="v10-doc" data-v10-document-id="${Number(r.id)}">
      <header class="v10-doc-header"><span class="v10-doc-type">주간 통합 위험성평가 · ${Number(r.revision)||1}차 · 문서 #${Number(r.id)}</span><h2>${clean(title)} 위험성평가</h2><p>${clean(site())} <span>·</span> ${clean(weekPeriod(r.week_start))}</p></header>
      <div class="v10-glance">${metric('위험요인',`${rows.length}건`,high?`고위험 ${high}건 포함`:'고위험 없음',high?'attention':'')}${metric('참여 업체',`${participating}개`,'원청 자체 작성 포함')}${metric('결재 상태',statusText[status]||status,topText,stateClass(status))}</div>
      ${stateNote}
      <section class="v10-document-risks"><div class="v10-section-title"><div><span class="v10-section-kicker">SAFETY REVIEW</span><h3>위험요인 및 감소대책 <span>${rows.length}건</span></h3></div><small>위험도가 높은 항목부터 표시합니다.</small></div>${sorted.length?sorted.map((x,i)=>riskCard(x,i+1)).join(''):'<div class="v10-empty">이 문서에 포함된 위험요인이 없습니다.</div>'}</section>
      <details class="v10-disclosure"><summary><span><b>회의·작성·승인 정보</b><small>참석자, 회의 의견, 상신·승인 시각</small></span><span class="v10-disclosure-chevron">펼치기 ↓</span></summary><dl class="v10-info-grid">${details}</dl></details>
      <details class="v10-disclosure"><summary><span><b>결재 진행 단계</b><small>취합 → 원청 상신 → 최종 결재</small></span><span class="v10-disclosure-chevron">펼치기 ↓</span></summary><div class="v10-process-steps"><div class="done">① 위험요인 취합 <small>${rows.length}건</small></div><div class="done">② 통합 평가서 상신 <small>${clean(r.submitted_by_name||'-')}</small></div><div class="${status==='APPROVED'?'done':status==='PENDING'?'active':status==='REJECTED'?'rejected':'muted'}">③ 최종 결재 <small>${clean(statusText[status]||status)}</small></div></div></details>
      <div class="v10-doc-footer"><button type="button" class="v10-pdf-button" onclick="window.open('/api/v8/weekly/${Number(r.id)}/report','_blank')">인쇄 · PDF 보고서 ↗</button><span>원본 및 결재 이력은 서버에 보존됩니다.</span></div></div>`;
  }

  if(!window.reviewUi)return;
  const old=reviewUi.showWeeklyDetails;
  reviewUi.showWeeklyDetails=function(r,items,events,revisions){
    old.call(this,r,items,events,revisions);
    if(!r||Number(this.getSelectedWeekly())!==Number(r.id))return;
    const host=byId('v7WeeklyDetails');if(host)host.innerHTML=detail(r,items);
    const audit=byId('v8WeeklyEvents');
    if(audit && audit.innerHTML){const contents=audit.innerHTML;audit.innerHTML=`<details class="v10-disclosure v10-audit"><summary><span><b>결재 이력 · 과거 차수</b><small>승인·반려·취소 기록과 이전 평가서</small></span><span class="v10-disclosure-chevron">펼치기 ↓</span></summary>${contents}</details>`;}
  };

  const release=byId('releaseVersion');if(release)release.textContent='SAFETY WORKSPACE · V10 / 가독성 개편';
})();
