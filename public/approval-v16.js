/* V16 · 3-stage approval: contractor manager -> prime safety manager -> site director.
   The server validates every transition. This UI never treats a submitted record as approved. */
(() => {
  'use strict';
  const byId=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const day=v=>String(v||'').slice(0,10);
  const clock=v=>{if(!v)return '—';const d=new Date(v);return Number.isNaN(d.getTime())?esc(String(v)):esc(d.toLocaleString('ko-KR',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}));};
  const role=()=>typeof siteContext!=='undefined'&&siteContext?.role||'';
  const currentSite=()=>typeof sid!=='undefined'&&sid!=='all'?String(sid):'';
  const currentWeek=()=>day(byId('v10WeekPicker')?.value||byId('v7WeekStart')?.value||(typeof v7Monday==='function'?v7Monday():''));
  const safeApi=(path,options)=>api(path,options);
  const reviewerLabel=r=>r?.review_role==='MANAGER'?'원청 현장관리자':'원청 안전관리자';
  const finalNo=r=>r?.review_role==='NONE'?'2':'3';
  const stageText=r=>r.status==='APPROVED'?'최종 승인 완료':r.status==='REJECTED'?'반려 · 재상신 필요':r.status==='CANCELLED'?'승인 취소':r.status==='PENDING'&&r.approval_stage==='SAFETY'?`2차 · ${reviewerLabel(r)} 검토 대기`:r.status==='PENDING'&&r.approval_stage==='DIRECTOR'?`${finalNo(r)}차 · 원청 현장소장 최종 승인 대기`:r.status==='PENDING'?'V16 이전 결재 대기 문서':r.status==='ARCHIVED'?'보관된 문서':'상신 전';
  const pendingName=r=>r.approval_stage==='SAFETY'?r.safety_assignee_name:r.approval_stage==='DIRECTOR'?r.director_assignee_name:null;
  window.v23IsMyTurn=r=>r.status==='PENDING'&&['SAFETY','DIRECTOR'].includes(r.approval_stage)&&Number(r.approval_stage==='SAFETY'?r.safety_user_id:r.director_user_id)===Number(me?.id)&&role()===(r.approval_stage==='SAFETY'?(r.review_role||'SAFETY_MANAGER'):'SITE_DIRECTOR');
  const state={site:null,week:null,queue:null,config:null,request:0,detailRequest:0};
  const notify=msg=>typeof toast==='function'?toast(msg):alert(msg);
  const companyStatus=c=>{
    if(c.status==='APPROVED'&&c.is_current)return {text:'1차 승인 완료',kind:'done'};
    if(c.status==='APPROVED'&&!c.is_current)return {text:'승인 후 내용 변경 · 재제출 필요',kind:'stale'};
    if(c.status==='SUBMITTED'&&!c.is_current)return {text:'제출 후 내용 변경 · 재제출 필요',kind:'stale'};
    if(c.status==='SUBMITTED')return {text:'협력사 관리자 결재 대기',kind:'wait'};
    if(c.status==='REJECTED')return {text:'반려 · 수정 후 재제출',kind:'reject'};
    return {text:'작성 후 제출 필요',kind:'empty'};
  };
  function configView(config){
    const host=byId('v16ApproverSetup');if(!host)return;
    const mode=config?.review_role||'SAFETY_MANAGER',skip=mode==='NONE';
    const safety=esc(config?.safety_name||'미지정'),director=esc(config?.director_name||'미지정');
    const editable=!!config?.can_configure;
    const candidates=Array.isArray(config?.candidates)?config.candidates:[];
    const opts=(kind,value)=>'<option value="">결재자 선택</option>'+candidates.filter(x=>x.role===kind).map(x=>`<option value="${Number(x.id)}" ${Number(x.id)===Number(value)?'selected':''}>${esc(x.name)}</option>`).join('');
    host.innerHTML=`<div class="v16-card-heading"><div><span class="v16-eyebrow">SITE APPROVAL ROUTE</span><h3>현장 결재선 설정</h3><p>신규 상신에 적용 · 현재 문서의 결재 이력과 별개</p></div>${editable?'<span class="v16-setting-label">관리자 전용</span>':''}</div>
    <div class="v16-assigned-line"><span><b>1차 · 협력사 관리자</b><strong>소속 업체별 승인</strong></span><i aria-hidden="true">→</i>${skip?'':`<span><b>2차 · ${reviewerLabel(config)}</b><strong>${safety}</strong></span><i aria-hidden="true">→</i>`}<span><b>${finalNo(config)}차 · 현장소장</b><strong>${director}</strong></span></div>
    ${editable?`<details class="v16-settings" id="v16ConfigEditor"><summary>현장 결재라인 구성 <span>관리자 설정</span></summary><p>사용자 관리에서 먼저 결재 담당자를 현장에 배정하세요. 결재 진행 중에는 결재선을 변경할 수 없습니다. 일반 작성자는 변경할 수 없습니다.</p>
    <div class="v16-config-fields"><label>결재 유형<select id="v18ReviewRole" onchange="v18ChangeRoute()"><option value="SAFETY_MANAGER" ${mode==='SAFETY_MANAGER'?'selected':''}>3단계 · 안전관리자 검토</option><option value="MANAGER" ${mode==='MANAGER'?'selected':''}>3단계 · 현장관리자 검토</option><option value="NONE" ${skip?'selected':''}>2단계 · 현장소장 직접 결재</option></select></label><label id="v18ReviewerField" ${skip?'hidden':''}>중간 검토자<select id="v16SafetySelect" ${skip?'disabled':''}>${opts(mode,config.safety_user_id)}</select></label><label>최종 결재자 · 현장소장<select id="v16DirectorSelect">${opts('SITE_DIRECTOR',config.director_user_id)}</select></label><button type="button" onclick="v16SaveApprovers()">현장 결재선 저장</button></div><label id="v18SelfField" style="${skip?'display:none':'display:flex'};align-items:center;gap:8px;margin-top:12px"><input id="v17SelfReview" type="checkbox" style="width:auto" ${config.allow_self_review!==false?'checked':''}> 중간 검토자의 본인 작성·상신 문서 검토 허용</label><small>2단계 선택은 내부 결재선에만 적용되며 법정 안전관리자 선임 의무와 별개입니다. 기존 결재 이력은 변경되지 않습니다.</small></details>`:''}`;
  }
  function changeRoute(){
    const mode=byId('v18ReviewRole')?.value,select=byId('v16SafetySelect'),field=byId('v18ReviewerField'),self=byId('v18SelfField');
    if(!select||!field)return;
    field.hidden=mode==='NONE';select.disabled=mode==='NONE';if(self)self.style.display=mode==='NONE'?'none':'flex';
    select.innerHTML='<option value="">결재자 선택</option>'+(state.config?.candidates||[]).filter(x=>x.role===mode).map(x=>`<option value="${Number(x.id)}" ${mode===state.config.review_role&&Number(x.id)===Number(state.config.safety_user_id)?'selected':''}>${esc(x.name)}</option>`).join('');
  }
  window.v18ChangeRoute=changeRoute;
  function queueView(queue){
    const host=byId('v16CompanyQueue');if(!host)return;
    const companies=Array.isArray(queue?.companies)?queue.companies:[];
    const approved=companies.filter(c=>c.status==='APPROVED'&&c.is_current).length;
    const locked=!!queue?.locked;
    host.innerHTML=`<div class="v16-card-heading"><div><span class="v16-eyebrow">STEP 01 · CONTRACTOR</span><h3>협력사별 1차 결재 <span class="v16-count ${approved===companies.length?'all-done':'not-done'}">${approved} / ${companies.length} 승인</span></h3><p>${locked?'통합 상신된 주차':approved===companies.length?'협력사 승인 요건 충족 · 원청 상신 조건 확인':'미승인 업체 확인 후 통합 상신'}</p></div><button type="button" class="v16-refresh" onclick="v16Refresh()">↻ 새로고침</button></div>
    ${companies.length?`<div class="v23-queue-progress" role="progressbar" aria-label="협력사 승인" aria-valuenow="${approved}" aria-valuemax="${companies.length}"><i style="width:${Math.round(approved/companies.length*100)}%"></i></div><div class="v16-company-list">${companies.map(c=>{
      const status=companyStatus(c),managers=c.managers?.length?c.managers.join(', '):'관리자 미지정';
      const canApprove=!!c.can_approve,canSubmit=!!c.can_submit;
      return `<article class="v16-company-row v23-company-${status.kind}"><div class="v16-company-main"><strong>${esc(c.name)} <span class="v23-count-small">${Number(c.risk_count)||0}건</span></strong><small>제출 ${esc(c.submitted_by_name||'미제출')} ${c.submitted_at?`· ${clock(c.submitted_at)}`:''}</small><small>${status.kind==='done'?'승인자':status.kind==='stale'?'이전 결재자':'담당 관리자'} ${esc(c.approved_by_name||managers)} ${c.approved_at?`· ${clock(c.approved_at)}`:''}</small>${c.status==='REJECTED'&&c.decision_comment?`<small class="v16-reason">반려: ${esc(c.decision_comment)}</small>`:''}</div><div class="v16-company-right"><span class="v16-pill ${status.kind}">${status.text}</span><div class="v16-inline-actions">${canSubmit&&status.kind!=='done'?`<button type="button" onclick="v16SubmitCompany(${Number(c.id)})">${c.status?'다시 제출':'작성 완료 제출'}</button>`:''}${canApprove?`<button type="button" class="v16-accept" onclick="v16DecideCompany(${Number(c.id)},'APPROVE')">1차 승인</button><button type="button" class="v16-deny" onclick="v16DecideCompany(${Number(c.id)},'REJECT')">반려</button>`:''}</div></div></article>`;
    }).join('')}</div>`:'<div class="v16-empty">이 주차에 작성된 협력사 위험요인이 없습니다. 먼저 위험요인을 작성해 주세요.</div>'}
    ${locked?'<p class="v16-locked-note">원청에 상신된 주차입니다. 협력사 제출·1차 결재는 잠겨 있습니다.</p>':''}
    <details class="v16-history-toggle" ontoggle="if(this.open)v16LoadCompanyEvents()"><summary>협력사 제출·승인·반려 이력 보기</summary><div id="v16CompanyEvents">열면 이력을 불러옵니다.</div></details>`;
    const summary=byId('v8ReadyStatus');if(summary){summary.textContent=`협력사 1차 승인 ${approved}/${companies.length}개 업체 · ${approved===companies.length?'원청 통합 상신 가능 (결재선 설정 필요)':'미승인 업체 확인 필요'}`;}
    const submit=byId('v7SubmitWeekly');if(submit){submit.disabled=companies.length>0&&approved!==companies.length;submit.title=submit.disabled?'협력사 1차 승인 완료 후 상신할 수 있습니다.':'';}
  }
  async function refresh(){
    const site=currentSite(),week=currentWeek();if(!site||!/^\d{4}-\d{2}-\d{2}$/.test(week))return;
    const token=++state.request;state.site=site;state.week=week;
    try{
      const [config,queue]=await Promise.all([
        safeApi(`/api/v16/approvers?site_id=${encodeURIComponent(site)}`),
        safeApi(`/api/v16/contractor-approvals?site_id=${encodeURIComponent(site)}&week_start=${encodeURIComponent(week)}`)
      ]);
      if(token!==state.request||currentSite()!==site||currentWeek()!==week)return;
      state.config=config;state.queue=queue;configView(config);queueView(queue);
    }catch(e){if(token!==state.request)return;const host=byId('v16CompanyQueue');if(host)host.innerHTML=`<div class="v16-empty">승인 현황을 불러오지 못했습니다: ${esc(e.message)} <button type="button" onclick="v16Refresh()">다시 시도</button></div>`;}
  }
  async function saveApprovers(){
    const site=currentSite(),reviewRole=byId('v18ReviewRole')?.value||'SAFETY_MANAGER',safety=reviewRole==='NONE'?null:Number(byId('v16SafetySelect')?.value),director=Number(byId('v16DirectorSelect')?.value);
    if(!state.config?.can_configure||String(state.config.site_id)!==site)return notify('현장 결재선 관리 권한을 확인하세요.');
    if(!director||reviewRole!=='NONE'&&(!safety||safety===director))return notify('현장소장과 필요한 중간 검토자를 지정하세요.');
    if(!confirm('이 현장의 원청 결재선을 저장할까요?'))return;
    try{await safeApi('/api/v16/approvers',{method:'PUT',body:JSON.stringify({site_id:site,review_role:reviewRole,safety_user_id:safety,director_user_id:director,allow_self_review:byId('v17SelfReview')?.checked!==false})});notify('결재선이 저장되었습니다.');await refresh();}
    catch(e){notify(e.message);}
  }
  async function submitCompany(id){
    const c=state.queue?.companies?.find(x=>Number(x.id)===Number(id));if(!c||!c.can_submit)return notify('이 업체의 제출 권한이 없습니다.');
    if(!confirm(`${c.name} · ${currentWeek()} 주간 위험성평가 ${c.risk_count}건을 협력사 관리자에게 제출할까요?`))return;
    try{await safeApi('/api/v8/weekly/ready',{method:'POST',body:JSON.stringify({site_id:Number(currentSite()),week_start:currentWeek(),contractor_id:id})});notify('협력사 관리자에게 1차 결재를 요청했습니다.');await refresh();}
    catch(e){notify(e.message);await refresh();}
  }
  async function decideCompany(id,action){
    const c=state.queue?.companies?.find(x=>Number(x.id)===Number(id));if(!c||!c.can_approve)return notify('현재 결재할 수 있는 업체가 아닙니다.');
    let comment='';
    if(action==='REJECT'){const reason=prompt(`${c.name} 반려 사유를 입력하세요.`);if(reason===null)return;comment=reason.trim();if(!comment)return notify('반려 사유를 입력해야 합니다.');}
    else if(!confirm(`${c.name} 위험요인 ${c.risk_count}건을 협력사 관리자로서 1차 승인할까요?`))return;
    try{await safeApi('/api/v16/contractor/decision',{method:'POST',body:JSON.stringify({site_id:Number(currentSite()),week_start:currentWeek(),contractor_id:id,action,comment})});notify(action==='APPROVE'?'협력사 1차 승인 완료':'협력사 위험성평가 반려 완료');await refresh();}
    catch(e){notify(e.message);await refresh();}
  }
  async function loadCompanyEvents(){
    const host=byId('v16CompanyEvents');if(!host)return;host.textContent='결재 이력 조회 중...';
    try{const rows=await safeApi(`/api/v16/contractor-events?site_id=${currentSite()}&week_start=${currentWeek()}`);
      host.innerHTML=rows.length?`<div class="v16-events">${rows.map(e=>`<div><time>${clock(e.created_at)}</time><b>${esc(e.contractor_name)}</b><span>${esc(e.actor_name||'담당자')} · ${e.action==='SUBMIT'?'제출':e.action==='APPROVE'?'1차 승인':'반려'}</span>${e.comment?`<small>${esc(e.comment)}</small>`:''}</div>`).join('')}</div>`:'<p>이 주차에 등록된 결재 이력이 없습니다.</p>';
    }catch(e){host.textContent=e.message;}
  }
  function stepRow(number,title,name,status,time,kind,extra=''){return `<div class="v16-step ${kind}"><span class="v16-step-number" aria-hidden="true">${kind==='done'?'✓':kind==='reject'?'!':number}</span><div class="v23-step-body"><div class="v23-step-role"><strong>${esc(title)}</strong><span class="v16-step-status">${esc(status)}</span></div><div class="v23-step-person">${esc(name||'담당자 미지정')}${time?`<time>${clock(time)}</time>`:''}</div>${extra}</div></div>`;}
  function actionsFor(record){
    const pending=record.status==='PENDING';
    const assigned=record.approval_stage==='SAFETY'?record.safety_user_id:record.director_user_id;
    const neededRole=record.approval_stage==='SAFETY'?(record.review_role||'SAFETY_MANAGER'):'SITE_DIRECTOR';
    const canDecide=pending&&Number(assigned)===Number(me?.id)&&role()===neededRole;
    const id=Number(record.id);
    if(canDecide)return `<button type="button" class="v16-action-approve" onclick="v16DecideWeekly(${id},'APPROVE')">${record.approval_stage==='SAFETY'?'검토 승인':`${finalNo(record)}차 최종 승인`}</button><button type="button" class="v16-action-reject" onclick="v16DecideWeekly(${id},'REJECT')">반려</button>`;
    if(pending&&record.approval_stage==='LEGACY'&&['MANAGER','ADMIN'].includes(role()))return `<button type="button" class="v16-action-reject" onclick="v16DecideWeekly(${id},'REJECT')">기존 문서 반려 후 재상신</button>`;
    if(pending)return '<span class="v16-awaiting">지정 결재자의 처리를 기다리고 있습니다.</span>';
    if(record.status==='APPROVED')return '<span class="v16-complete">✓ 최종 결재 완료 · 결재 이력 보존</span>';
    if(record.status==='REJECTED')return '<span class="v16-awaiting">반려됨 · 위험요인 확인 후 새 차수로 재상신하세요.</span>';
    return '<span class="v16-awaiting">이 문서의 결재 이력을 확인하세요.</span>';
  }
  function renderDocument(record,detail){
    const host=byId('v7WeeklyDetails');if(!host||!record)return;
    host.querySelectorAll('.v16-document-trail').forEach(x=>x.remove());
    const stageEvents=Array.isArray(detail?.stages)?detail.stages:[];
    const thisRevision=stageEvents.filter(x=>Number(x.revision)===Number(record.revision));
    const safety=thisRevision.find(x=>x.stage==='SAFETY'&&x.action==='APPROVE');
    const director=thisRevision.find(x=>x.stage==='DIRECTOR'&&x.action==='APPROVE');
    const rejection=thisRevision.findLast(x=>x.action==='REJECT');
    const legacy=record.approval_stage==='LEGACY';
    const companies=Array.isArray(detail?.contractor_approvals)?detail.contractor_approvals:[];
    const companyProof=detail?.contractor_history_available!==false&&!legacy;
    const noCompany=!companies.length&&!siteContext?.company_required&&companyProof;
    const remaining=legacy?'이력 없음':record.status==='APPROVED'?'이력 확인 필요':record.status==='PENDING'?'결재 예정':'미처리';
    const allApproved=companies.length>0&&companies.every(c=>c.status==='APPROVED'&&c.approved_at);
    const companyRows=companies.map(c=>`<div class="v23-company-proof"><b>${esc(c.contractor_name||'업체명 미기록')}</b><span>${c.status==='APPROVED'?'승인':'확인 필요'} · ${esc(c.approved_by_name||'이름 미기록')}${c.approved_at?` · ${clock(c.approved_at)}`:''}</span></div>`).join('');
    const first=stepRow('1','1차 · 협력사 승인',!companyProof?'단계별 기록 없음':companies.length?`${companies.filter(c=>c.status==='APPROVED'&&c.approved_at).length}/${companies.length}개 ${siteContext?.company_required?'열람 가능 ':''}업체 승인`:noCompany?'원청 자체 작성':'승인 정보 확인 필요',!companyProof?'이력 없음':companies.length?(allApproved?'승인 완료':'확인 필요'):noCompany?'해당 없음':'확인 필요',null,allApproved&&companyProof?'done':'future',companies.length&&companyProof?`<details class="v23-company-proof-box" ${companies.length<=2?'open':''}><summary>업체별 승인자 · 시간</summary>${companyRows}</details>`:'');
    const safetyStatus=safety?'승인 완료':rejection?.stage==='SAFETY'?'반려':record.status==='PENDING'&&record.approval_stage==='SAFETY'?'현재 결재 대기':remaining;
    const directorStatus=director?'승인 완료':rejection?.stage==='DIRECTOR'?'반려':record.status==='PENDING'&&record.approval_stage==='DIRECTOR'?'현재 결재 대기':remaining;
    const second=record.review_role==='NONE'?'':stepRow('2','2차 · '+reviewerLabel(record),safety?.actor_name||(rejection?.stage==='SAFETY'?rejection.actor_name:null)||detail?.safety_name||record.safety_assignee_name||'미지정',safetyStatus,safety?.created_at||(rejection?.stage==='SAFETY'?rejection.created_at:null),safety?'done':safetyStatus==='현재 결재 대기'?'current':safetyStatus==='반려'?'reject':'future');
    const third=stepRow(finalNo(record),finalNo(record)+'차 · 원청 현장소장',director?.actor_name||(rejection?.stage==='DIRECTOR'?rejection.actor_name:null)||detail?.director_name||record.director_assignee_name||'미지정',directorStatus,director?.created_at||(rejection?.stage==='DIRECTOR'?rejection.created_at:null),director?'done':directorStatus==='현재 결재 대기'?'current':directorStatus==='반려'?'reject':'future');
    const hist=[...stageEvents.map(e=>({...e,label:`${Number(e.revision)}차 문서 · ${e.stage==='SAFETY'?reviewerLabel(e):'원청 현장소장'} · ${e.action==='APPROVE'?'승인':'반려'}`})),...(Array.isArray(detail?.companies)?detail.companies:[]).map(e=>({...e,label:`${e.contractor_name} · ${e.action==='SUBMIT'?'제출':e.action==='APPROVE'?'1차 승인':'반려'}`}))].sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
    const history=hist.map(e=>`<div class="v16-event-row"><time>${clock(e.created_at)}</time><span>${esc(e.label)}</span><b>${esc(e.actor_name||'-')}</b>${e.comment?`<small>${esc(e.comment)}</small>`:''}</div>`).join('');
    const pending=record.status==='PENDING',mine=window.v23IsMyTurn(record),person=pendingName(record)||(record.approval_stage==='SAFETY'?detail?.safety_name:detail?.director_name)||'미지정';
    const stateLabel=record.status==='APPROVED'?'최종 승인 완료':record.status==='REJECTED'?'반려':record.status==='CANCELLED'?'승인 취소':record.status==='ARCHIVED'?'보관':mine?'내 결재 대기':pending?'결재 진행 중':'이력 조회';
    const currentTitle=pending&&!legacy?person+' · '+(record.approval_stage==='SAFETY'?reviewerLabel(record)+' 검토 대기':'현장소장 최종 승인 대기'):stageText(record);
    const currentSub=pending&&!legacy?mine?'내 결재 차례입니다. 평가 내용을 확인한 뒤 승인 또는 반려하세요.':'현재 지정된 결재자의 처리를 기다리고 있습니다.':record.status==='APPROVED'?`${record.approved_by_name||director?.actor_name||'승인자 미기록'} · ${clock(record.approved_at||director?.created_at)}`:record.status==='REJECTED'?`반려자 ${rejection?.actor_name||'기록 확인 필요'}${rejection?.created_at?' · '+clock(rejection.created_at):''}`:'과거 결재 이력을 확인할 수 있습니다.';
    const div=document.createElement('section');div.className='v16-document-trail';
    div.innerHTML=`<div class="v16-trail-head"><div><h4>결재 진행 현황</h4><p>${esc(day(record.week_start))} 시작 주차 · ${Number(record.revision)}차 문서</p></div><span class="v16-doc-chip ${record.status==='APPROVED'?'done':record.status==='REJECTED'?'reject':pending?'current':''}">${esc(stateLabel)}</span></div>
      <div class="v23-current-approval ${record.status==='APPROVED'?'done':record.status==='REJECTED'?'reject':pending?'current':''}"><small>${pending&&!legacy?'현재 결재자':'문서 상태'}</small><strong>${esc(currentTitle)}</strong><p>${esc(currentSub)}</p></div>
      <div class="v23-submitter"><span>상신자 <b>${esc(record.submitted_by_name||'기록 없음')}</b></span><time>${clock(record.submitted_at)}</time></div>
      ${legacy?'<p class="v16-legacy-warning">이전 버전 문서입니다. 단계별 승인을 임의로 표시하지 않습니다.</p>':''}
      <div class="v16-steps">${first}${second}${third}</div>
      ${rejection?`<p class="v16-rejection">반려 사유: ${esc(rejection.comment||record.decision_comment||'-')}</p>`:''}
      <div class="v16-decision-actions">${actionsFor(record)}${['REJECTED','CANCELLED'].includes(record.status)&&typeof v17CanSubmit==='function'&&v17CanSubmit()?`<button type="button" onclick="v8ReloadRejected('${esc(day(record.week_start))}')">수정 후 재상신 준비</button>`:''}<button type="button" class="v23-print" onclick="window.open('/api/v8/weekly/${Number(record.id)}/report','_blank')">인쇄 · PDF</button></div>
      <details class="v16-history-toggle"><summary>결재 이력 ${hist.length}건 · 시간순 보기</summary><div class="v16-events">${history||'<p>단계별 이력이 없습니다.</p>'}</div></details>`;
    host.prepend(div);
    host.classList.add('v23-has-trail');
    // Remove the obsolete 3-step (compile/submit/approve) graphic; V16's verified
    // contractor/safety/director timeline above is the single source of truth.
    host.querySelectorAll('.v10-disclosure').forEach(section=>{
      if(section.querySelector('.v10-process-steps'))section.remove();
    });
    const oldAudit=byId('v8WeeklyEvents');
    if(oldAudit){
      const label=oldAudit.querySelector('.v10-audit summary b');if(label)label.textContent='문서 변경 이력 · 과거 차수 PDF';
      // Preserve cancellation / archival and generic submission history in the existing audit section.
    }
    const focus=byId('v12Focus');if(focus){
      const title=focus.querySelector('.v12-focus-title h3');if(title)title.textContent=stageText(record);
      const desc=focus.querySelector('.v12-focus-title p');if(desc)desc.textContent=record.status==='PENDING'?'현재 결재 단계와 담당자를 아래에서 확인하세요. 승인/반려 이력은 서버에 저장됩니다.':record.status==='APPROVED'?'최종 승인 완료 · 각 단계별 승인자와 시간을 아래에서 확인할 수 있습니다.':legacy?'이전 버전 문서는 승인 이력을 임의로 생성하지 않습니다.':'이 문서의 결재 이력을 확인하세요.';
      const buttons=focus.querySelector('.v12-focus-actions');if(buttons)buttons.innerHTML='';
      const last=focus.querySelector('.v12-accountability>div:last-child');if(last){const name=record.status==='APPROVED'?record.approved_by_name||'-':record.approval_stage==='DIRECTOR'?record.director_assignee_name||'미지정':record.safety_assignee_name||'미지정';last.innerHTML=`<span>${record.status==='APPROVED'?'최종 승인자':'현재 결재 담당자'}</span><strong>${esc(name)}</strong><small>${record.status==='APPROVED'?clock(record.approved_at):record.approval_stage==='SAFETY'?'2차 검토 대기':record.approval_stage==='DIRECTOR'?`${finalNo(record)}차 최종 승인 대기`:'이력 확인'}</small>`;}
    }
  }
  async function loadDocument(record){
    if(!record)return;const token=++state.detailRequest,site=currentSite();
    try{const detail=await safeApi(`/api/v16/weekly/${Number(record.id)}/stages`);
      if(token!==state.detailRequest||site!==currentSite()||Number(reviewUi.getSelectedWeekly())!==Number(record.id))return;
      renderDocument(record,detail);
    }catch(e){const host=byId('v7WeeklyDetails');if(host&&Number(reviewUi.getSelectedWeekly())===Number(record.id))host.insertAdjacentHTML('afterbegin',`<p class="v16-error">결재 이력 조회 오류: ${esc(e.message)}</p>`);}
  }
  async function decideWeekly(id,action){
    const record=(typeof v7WeeklyRows!=='undefined'?v7WeeklyRows:[]).find(x=>Number(x.id)===Number(id));
    if(!record||record.status!=='PENDING')return notify('이미 처리된 문서입니다. 새로고침 후 확인하세요.');
    const allowed=record.approval_stage==='LEGACY'?['MANAGER','ADMIN'].includes(role())&&action==='REJECT':
      Number(record.approval_stage==='SAFETY'?record.safety_user_id:record.director_user_id)===Number(me?.id)&&role()===(record.approval_stage==='SAFETY'?(record.review_role||'SAFETY_MANAGER'):'SITE_DIRECTOR');
    if(!allowed)return notify('현재 단계의 지정 결재자만 처리할 수 있습니다.');
    let comment='';
    if(action==='REJECT'){const input=prompt(`${day(record.week_start)} · ${stageText(record)}\n반려 사유를 입력하세요.`);if(input===null)return;comment=input.trim();if(!comment)return notify('반려 사유를 입력하세요.');}
    else if(!confirm(`${day(record.week_start)} · ${Number(record.revision)||1}차 평가서를 ${record.approval_stage==='SAFETY'?`${reviewerLabel(record)} 검토 승인`:'현장소장 최종 승인'}하시겠습니까?`))return;
    try{await safeApi(`/api/v7/weekly/${id}/decision`,{method:'POST',body:JSON.stringify({action,comment})});notify(action==='REJECT'?'평가서를 반려했습니다.':record.approval_stage==='SAFETY'?'2차 승인 완료 · 현장소장 결재 대기':`${finalNo(record)}차 최종 승인 완료`);
      await loadV7WeeklyList('approval');reviewUi.selectWeekly(Number(id));await refresh();if(typeof loadDash==='function')loadDash();
    }catch(e){notify(e.message);await loadV7WeeklyList('approval');await refresh();}
  }
  async function submitWeekly(){
    if(!['MANAGER','ADMIN','SAFETY_MANAGER'].includes(role()))return notify('원청 현장관리자 또는 안전관리자만 통합 상신할 수 있습니다.');
    const week=day(byId('v7WeekStart')?.value),rows=typeof v7Preview!=='undefined'?v7Preview:[];
    if(!rows.length)return notify('상신할 위험요인이 없습니다.');
    const queue=state.queue;
    if(queue&&queue.week_start===week&&queue.companies.some(c=>c.status!=='APPROVED'||!c.is_current))return notify('협력사 1차 미승인 업체가 있습니다. 위 결재 현황을 확인하세요.');
    if(String(state.config?.site_id)!==currentSite()||!state.config?.director_user_id||state.config.review_role!=='NONE'&&!state.config.safety_user_id)return notify('현장관리자가 결재선을 먼저 지정해야 합니다.');
    if(!confirm(`${week} 주간 위험요인 ${rows.length}건을 통합 상신할까요?\n협력사 1차 승인 후 ${state.config.review_role==='NONE'?'현장소장 최종 결재':reviewerLabel(state.config)+' → 현장소장'} 순서로 결재됩니다.`))return;
    const payload={site_id:Number(currentSite()),week_start:week,meeting_date:byId('v8MeetingDate')?.value,attendees:byId('v8Attendees')?.value,meeting_notes:byId('v7MeetingNotes')?.value};
    try{await safeApi('/api/v7/weekly',{method:'POST',body:JSON.stringify(payload)});notify('통합 상신 완료 · '+(state.config.review_role==='NONE'?'현장소장 최종 결재 대기':reviewerLabel(state.config)+' 검토 대기'));await loadV7WeeklyList('approval');await refresh();if(typeof loadDash==='function')loadDash();}
    catch(e){notify(e.message);await refresh();}
  }
  function updateListLabels(){
    if(typeof v7WeeklyRows==='undefined')return;
    byId('v7WeeklyList')?.querySelectorAll('[data-review-id]').forEach(b=>{
      const r=v7WeeklyRows.find(x=>Number(x.id)===Number(b.dataset.reviewId));if(!r)return;
      b.querySelector('.v16-stage-tag')?.remove();
      b.insertAdjacentHTML('beforeend',`<span class="v16-stage-tag ${window.v23IsMyTurn(r)?'mine':''}">${esc(window.v23IsMyTurn(r)?'내 결재 대기 · '+stageText(r):stageText(r))}${r.status==='PENDING'&&pendingName(r)?' · '+esc(pendingName(r)):''}</span>`);
    });
  }
  if(window.reviewUi){
    const originalDetails=reviewUi.showWeeklyDetails;
    reviewUi.showWeeklyDetails=function(record,items,events,revisions){
      byId('v7WeeklyDetails')?.classList.remove('v23-has-trail');
      originalDetails.call(this,record,items,events,revisions);
      if(record)loadDocument(record);
    };
    const originalList=reviewUi.renderWeeklyList;
    reviewUi.renderWeeklyList=function(rows,mode){originalList.call(this,rows,mode);updateListLabels();};
    const originalFilter=reviewUi.filterWeekly;
    reviewUi.filterWeekly=function(...args){const result=originalFilter.apply(this,args);updateListLabels();return result;};
  }
  // Keep V12 navigation and V15 design; refresh the V16 queue when users switch site/week/task.
  const originalOpen=window.v12OpenWorkspace;
  if(typeof originalOpen==='function')window.v12OpenWorkspace=function(...args){const result=originalOpen.apply(this,args);refresh();return result;};
  const originalWeeklyTab=window.v7WeeklyTab;
  if(typeof originalWeeklyTab==='function')window.v7WeeklyTab=function(...args){const result=originalWeeklyTab.apply(this,args);refresh();return result;};
  const originalRiskTab=window.v7RiskTab;
  if(typeof originalRiskTab==='function')window.v7RiskTab=function(...args){const result=originalRiskTab.apply(this,args);refresh();return result;};
  const originalChange=window.v12ChangeWeek;
  if(typeof originalChange==='function')window.v12ChangeWeek=function(...args){const result=originalChange.apply(this,args);refresh();return result;};
  const originalMode=window.v12ShowMode;
  if(typeof originalMode==='function')window.v12ShowMode=function(...args){const result=originalMode.apply(this,args);refresh();return result;};
  const originalRefresh=window.v12Refresh;
  if(typeof originalRefresh==='function')window.v12Refresh=async function(...args){const result=await originalRefresh.apply(this,args);await refresh();return result;};
  const originalSiteContext=window.loadV8SiteContext;
  if(typeof originalSiteContext==='function')window.loadV8SiteContext=async function(...args){const result=await originalSiteContext.apply(this,args);if(currentSite())refresh();return result;};
  window.v16Refresh=refresh;
  window.v16SaveApprovers=saveApprovers;
  window.v16SubmitCompany=submitCompany;
  window.v16DecideCompany=decideCompany;
  window.v16LoadCompanyEvents=loadCompanyEvents;
  window.v16DecideWeekly=decideWeekly;
  window.decideV7Weekly=decideWeekly;
  window.submitV7Weekly=submitWeekly;
  const version=byId('releaseVersion');if(version)version.textContent='SAFETY WORKSPACE · V18 / 현장별 결재선 관리';
})();
