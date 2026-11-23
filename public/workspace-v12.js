/* V13: ① 작성 → ② 업체별 확인 → ③ 취합·상신 → ④ 최종 결재.
   기존 서버 API, 접근 권한, 결재 기록은 변경하지 않는다. */
(() => {
  'use strict';
  const el = id => document.getElementById(id);
  const safe = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date = value => String(value || '').slice(0,10);
  const niceTime = value => {
    if (!value) return '-';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? date(value) : d.toLocaleString('ko-KR', {year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
  };
  const labels = {PENDING:'결재 대기',APPROVED:'승인 완료',REJECTED:'반려',CANCELLED:'승인 취소',ARCHIVED:'정리 보관'};
  const currentWeek = () => typeof v10WeekMonday === 'function' ? v10WeekMonday(el('v10WeekPicker')?.value || v7Monday()) : date(el('v10WeekPicker')?.value);
  const currentRows = () => typeof v7WeeklyRows !== 'undefined' && Array.isArray(v7WeeklyRows) ? v7WeeklyRows : [];
  const findWeekDoc = () => currentRows().find(row => date(row.week_start) === currentWeek());
  const canApprove = () => typeof v8IsManager === 'function' && v8IsManager();
  const state = {mode:'write', autoMode:true, selectedId:null, site:null, showingCurrent:true, initialized:false, listRendering:false};
  const legacyWeeklyTab = window.v7WeeklyTab;
  const legacySaveRisk = window.saveRisk;
  const legacySubmit = window.submitV7Weekly;
  const legacyDecision = window.decideV7Weekly;
  const legacyActionTab = window.v8ActionTab;
  const legacyTbmApproval = window.v8TbmApprovalTab;
  const legacyWeekBoard = window.v10LoadWeekBoard;
  const legacyPreview = window.loadV7WeeklyPreview;
  const legacyWeeklyList = window.loadV7WeeklyList;
  const legacyReady = window.v8MarkReady;

  function moveLegacyViews() {
    if (state.initialized) return;
    state.initialized = true;
    const write = el('v7_risk_write'), lookup = el('v7_risk_lookup');
    if (write) {el('v12PanelWrite').appendChild(write); write.classList.remove('hidden');}
    if (lookup) {el('v12PanelLookup').appendChild(lookup); lookup.classList.remove('hidden');}
    const templateCard = el('template')?.querySelector('.card');
    if (templateCard) el('v12PanelTemplate').appendChild(templateCard);
    const tbm = el('tbm'), approvals = el('tbmApprovals');
    if (tbm && approvals) {
      const toolbar = document.createElement('div');
      toolbar.className = 'v12-sub-tabs';
      toolbar.innerHTML = `<button type="button" data-v12-tbm="lookup" onclick="v12TbmTab('lookup')">TBM 기록 확인</button><button type="button" data-v12-tbm="write" onclick="v12TbmTab('write')">＋ TBM 작성</button><button type="button" data-v12-tbm="approvals" onclick="v12TbmTab('approvals')">TBM 결재</button>`;
      tbm.prepend(toolbar);
      const panel = document.createElement('div'); panel.id='v12TbmApprovalsInline'; panel.className='hidden';
      while (approvals.firstChild) panel.appendChild(approvals.firstChild);
      tbm.appendChild(panel);
    }
    const action = el('action');
    if (action) {
      const toolbar = document.createElement('div');
      toolbar.className='v12-sub-tabs';
      toolbar.innerHTML = `<button type="button" data-v12-action="open" onclick="v8ActionTab('open')">미조치·진행 중</button><button type="button" data-v12-action="verify" onclick="v8ActionTab('verify')">조치 완료·확인</button><button type="button" data-v12-action="register" onclick="v8ActionTab('register')">＋ 새 지적 등록</button>`;
      action.prepend(toolbar);
    }
  }

  function activeMode(mode) {
    state.mode=mode;
    for(const name of ['document','write','lookup','compose','template']) {
      const node=el('v12Panel'+name[0].toUpperCase()+name.slice(1));
      if (node) node.classList.toggle('hidden',mode!==name);
    }
    document.querySelectorAll('[data-v12-mode]').forEach(button => {
      const on=button.dataset.v12Mode===mode;
      button.classList.toggle('active',on);
      button.setAttribute('aria-current',on?'page':'false');
    });
  }

  function selectedRecord() {
    return currentRows().find(row => Number(row.id) === state.selectedId) || null;
  }

  function renderFocus(record,items) {
    const host=el('v12Focus'); if (!host) return;
    const week=record?date(record.week_start):currentWeek();
    const isDoc=!!record;
    const status=isDoc?(labels[record.status]||'상태 확인'):'작성 중 · 상신 전';
    const approved=record?.status==='APPROVED',pending=record?.status==='PENDING';
    const revision=isDoc?`${Number(record.revision)||1}차 통합 평가서`:'작성 중인 주차';
    const rows=Array.isArray(items)?items:[];
    const authors=[...new Set(rows.map(x=>String(x.author_name||'').trim()).filter(Boolean))];
    const authorsLabel=authors.length?authors.slice(0,2).join(', ')+(authors.length>2?` 외 ${authors.length-2}명`:''):'개별 위험요인에서 확인';
    const count=isDoc?Number(record.item_count)||rows.length:rows.length;
    const submitted=isDoc?record.submitted_by_name||'기록 확인 필요':'상신 전';
    const approver=approved?record.approved_by_name||'승인자 확인 필요':pending?'원청 결재 담당자 대기':record?.status==='REJECTED'?'반려 처리됨':record?.status==='CANCELLED'?'승인 취소됨':'결재 전';
    const when=approved?niceTime(record.approved_at):pending?niceTime(record.submitted_at):'-';
    const stamp=isDoc&&window.v11Approval ? v11Approval.stamp(record,'v12') : '<div class="v12-empty-stamp"><span>결재 상태</span><strong>상신 전</strong><small>원청 결재 기록 없음</small></div>';
    let primary=''; let secondary='';
    if (!isDoc) {
      primary=count>0?'<button class="v12-main-button" type="button" onclick="v12ShowMode(\'lookup\')">작성 기록 확인</button>':'<button class="v12-main-button" type="button" onclick="v12ShowMode(\'write\')">위험요인 작성</button>';
      secondary=count>0&&canApprove()?'<button class="v12-text-button" type="button" onclick="v12ShowMode(\'compose\')">취합·상신으로 이동</button>':'<button class="v12-text-button" type="button" onclick="v12ShowMode(\'lookup\')">업체별 기록 확인</button>';
    } else if (pending && canApprove()) {
      primary=`<button class="v12-main-button success" type="button" onclick="decideV7Weekly(${Number(record.id)},'APPROVE')">이 평가서 최종 승인</button>`;
      secondary=`<button class="v12-text-button danger" type="button" onclick="decideV7Weekly(${Number(record.id)},'REJECT')">반려</button>`;
    } else if (pending) {
      primary='<span class="v12-awaiting">원청 담당자의 최종 결재를 기다리는 중</span>';
    } else if (['REJECTED','CANCELLED'].includes(record.status) && canApprove()) {
      primary=`<button class="v12-main-button" type="button" onclick="v8ReloadRejected('${safe(week)}')">수정 후 재상신 준비</button>`;
    } else if (approved) {
      primary='<span class="v12-done-label">✓ 최종 결재가 완료된 문서입니다</span>';
    }
    if (isDoc) secondary+=`<button class="v12-text-button" type="button" onclick="window.open('/api/v8/weekly/${Number(record.id)}/report','_blank')">인쇄·PDF</button>`;
    const meta=approved?'처리 완료 · 추가 결재가 필요하지 않습니다.':pending?'상신 완료 · 담당자의 최종 승인 또는 반려가 남았습니다.':record?.status==='CANCELLED'?'승인 취소 이력은 보존됩니다. 수정 후 재상신하세요.':record?.status==='REJECTED'?'반려 이력을 확인하고 수정 후 재상신하세요.':count>0?'작성된 위험요인을 확인한 뒤 취합·상신하세요.':'먼저 위험요인을 작성해 주세요. 업체 제출과 최종 결재는 별도 단계입니다.';
    host.innerHTML=`<div class="v12-focus-primary"><div class="v12-focus-title"><span class="v12-kicker">${safe(week)} 시작 주차 · ${safe(revision)}</span><h3>${safe(status)}</h3><p>${safe(meta)}</p></div><div class="v12-stamp-slot">${stamp}</div></div>
      <div class="v12-accountability"><div><span>위험요인</span><strong>${count}건</strong></div><div><span>작성자</span><strong title="${safe(authors.join(', ')||'-')}">${safe(authorsLabel)}</strong></div><div><span>상신자</span><strong>${safe(submitted)}</strong></div><div><span>최종 결재자</span><strong>${safe(approver)}</strong><small>${safe(when)}</small></div></div>
      <div class="v12-focus-actions">${primary}${secondary}</div>`;
    const badge=el('v12WeekStatus');if(badge)badge.textContent=status;
    const label=el('v12CurrentWeekLabel');if(label)label.textContent=week+' 시작';
    const hint=el('v12CurrentWeekHint');if(hint)hint.textContent=isDoc?`${status} · ${Number(record.item_count)||0}건`:`위험요인 ${count}건 · 상신 전`;
    const current=el('v12CurrentWeek');if(current){current.classList.toggle('active',state.showingCurrent);current.classList.toggle('hidden',isDoc);}
    const top=el('v12TopAction');if(top)top.innerHTML=''; // V14: 중복 버튼 제거, 문서 상태 카드의 다음 작업만 표시
  }

  function renderDraft() {
    state.selectedId=null;state.showingCurrent=true;
    el('v12DraftSummary')?.classList.remove('hidden');
    el('v7WeeklyDetailsCard')?.classList.add('hidden');
    const preview=typeof v7Preview!=='undefined'&&Array.isArray(v7Preview)?v7Preview:[];
    renderFocus(null,preview);
    activeMode(state.autoMode?'write':state.mode);
  }

  function selectCurrentWeek() {
    const doc=findWeekDoc();
    state.showingCurrent=true;
    if (doc && window.reviewUi) {
      reviewUi.selectWeekly(Number(doc.id));
      return;
    }
    renderDraft();
  }

  function changeWeek() {
    const week=currentWeek();
    el('v10WeekPicker').value=week;
    el('v7WeekStart').value=week;
    if (el('v8RiskWeek')) el('v8RiskWeek').value=week;
    selectCurrentWeek();
    legacyWeekBoard?.();
    legacyPreview?.().then(()=>{if(state.selectedId===null)renderFocus(null,typeof v7Preview!=='undefined'?v7Preview:[])}).catch(()=>{});
  }

  function showMode(mode) {
    state.autoMode=false;
    moveLegacyViews();
    if (!el('weekly') || el('weekly').classList.contains('hidden')) return openWorkspace(mode);
    if (mode==='compose') {
      const r=selectedRecord()||findWeekDoc();
      if(r && ['PENDING','APPROVED'].includes(r.status) && date(r.week_start)===currentWeek()) {
        if (typeof toast==='function') toast('이 주차는 이미 상신된 문서가 있습니다. 평가서·결재에서 확인하세요.');
        return showMode('document');
      }
      el('v7WeekStart').value=currentWeek();
      el('reviewCompose').open=true;
      el('reviewCompose').classList.remove('hidden');
      legacyPreview?.();
    }
    if(mode==='write') {
      const lockedDoc=findWeekDoc();
      const warning=el('v12WriteWarning');
      if(warning){const locked=lockedDoc&&['PENDING','APPROVED'].includes(lockedDoc.status);warning.classList.toggle('hidden',!locked);if(locked)warning.textContent='이 주차는 이미 상신된 평가서가 있습니다. 새로 작성한 위험요인은 기존 결재 문서에 자동 반영되지 않습니다.';}
      if(typeof loadContractors==='function')loadContractors();
      if(typeof loadSettings==='function')loadSettings();
      if(typeof loadRisks==='function')loadRisks();
    }
    if(mode==='lookup') {
      if(el('v8RiskWeek'))el('v8RiskWeek').value=currentWeek();
      if(typeof loadV8RiskWeek==='function')loadV8RiskWeek();
      if(typeof loadRisks==='function')loadRisks();
    }
    if(mode==='template' && typeof loadTemplates==='function')loadTemplates();
    activeMode(mode);
    el('v12Focus')?.scrollIntoView({behavior:'instant',block:'nearest'});
  }

  function openWorkspace(mode='auto') {
    moveLegacyViews();
    if(typeof requireSite==='function'&&!requireSite())return;
    if(typeof sid!=='undefined'&&state.site!==String(sid)){
      state.site=String(sid);state.selectedId=null;state.showingCurrent=true;
      el('v10WeekPicker').value=v7Monday();
    }
    legacyWeeklyTab('approval');
    el('reviewStatusFilter').disabled=false;
    if (mode==='auto') {
      state.autoMode=true;
      renderDraft();
    } else if(mode==='document') {
      state.autoMode=false;
      activeMode('document');
      renderDraft();
      activeMode('document');
    } else showMode(mode);
  }

  async function refresh() {
    await legacyWeeklyList('approval');
    selectCurrentWeek();
    await legacyWeekBoard?.();
    if(state.selectedId===null)await legacyPreview?.();
  }

  // One canonical document list and one visible approval action, never a second decision ribbon.
  if (window.reviewUi) {
    const originalList=reviewUi.renderWeeklyList;
    reviewUi.renderWeeklyList=function(rows,mode){
      // 목록이 갱신돼도 사용자가 고른 주차를 임의로 다른 문서의 주차로 바꾸지 않는다.
      const wantedWeek=currentWeek(), previousMode=state.mode, previousId=state.selectedId, wasCurrent=state.showingCurrent, wasAuto=state.autoMode;
      state.listRendering=true;
      try{originalList.call(this,rows,'approval')}finally{state.listRendering=false}
      el('v10WeekPicker').value=wantedWeek;
      el('v7WeekStart').value=wantedWeek;
      const matching=(Array.isArray(rows)?rows:[]).find(r=>date(r.week_start)===wantedWeek);
      if(wasCurrent){
        if(matching)this.selectWeekly(Number(matching.id));
        else renderDraft();
      }else if(previousId && (Array.isArray(rows)?rows:[]).some(r=>Number(r.id)===previousId)){
        this.selectWeekly(previousId);
      }else if(matching)this.selectWeekly(Number(matching.id));
      else renderDraft();
      state.autoMode=wasAuto;
      if(wasAuto)activeMode(matching?'document':'write');
      else activeMode(previousMode);
    };
    const originalSelect=reviewUi.selectWeekly;
    reviewUi.selectWeekly=function(id){
      if(state.listRendering)return;
      const record=currentRows().find(x=>Number(x.id)===Number(id));
      if(record){
        state.selectedId=Number(id);state.showingCurrent=date(record.week_start)===currentWeek();
        el('v10WeekPicker').value=date(record.week_start);
        el('v7WeekStart').value=date(record.week_start);
        el('v12DraftSummary')?.classList.add('hidden');
        el('v7WeeklyDetailsCard')?.classList.remove('hidden');
        state.autoMode=false;
        activeMode('document');
        renderFocus(record);
      }
      return originalSelect.call(this,id);
    };
    const originalDetails=reviewUi.showWeeklyDetails;
    reviewUi.showWeeklyDetails=function(record,items,events,revisions){
      originalDetails.call(this,record,items,events,revisions);
      if(record&&state.selectedId===Number(record.id)&&state.mode==='document'){
        renderFocus(record,items);
        el('v12DraftSummary')?.classList.add('hidden');
        el('v7WeeklyDetailsCard')?.classList.remove('hidden');
      }
    };
    const originalFilter=reviewUi.filterWeekly;
    reviewUi.filterWeekly=function(...args){
      const value=el('reviewStatusFilter')?.value;
      const result=originalFilter.apply(this,args);
      if(value!=='ALL'&&currentRows().length===0)renderDraft();
      return result;
    };
  }

  window.v12OpenWorkspace=openWorkspace;
  window.v12ShowMode=showMode;
  window.v12SelectCurrentWeek=selectCurrentWeek;
  window.v12ChangeWeek=changeWeek;
  window.v12Refresh=refresh;
  window.v7RiskTab=function(tab){openWorkspace(tab==='lookup'?'lookup':'write')};
  window.v7WeeklyTab=function(tab){openWorkspace('auto');if(tab==='completed'){el('reviewStatusFilter').value='APPROVED';reviewUi.filterWeekly(true)}};
  window.v10OpenCompose=function(){showMode('compose')};
  window.v8ReloadRejected=function(week){openWorkspace('document');el('v10WeekPicker').value=date(week);el('v7WeekStart').value=date(week);showMode('compose');if(typeof toast==='function')toast('회의 내용과 위험요인을 확인한 뒤 재상신하세요.')};
  window.saveRisk=async function(...args){await legacySaveRisk(...args);if(el('weekly')&&!el('weekly').classList.contains('hidden')){legacyPreview?.();legacyWeekBoard?.()}};
  window.submitV7Weekly=async function(...args){await legacySubmit(...args);await legacyWeeklyList('approval');selectCurrentWeek();activeMode('document')};
  window.decideV7Weekly=async function(...args){await legacyDecision(...args);await legacyWeeklyList('approval');selectCurrentWeek();activeMode('document')};
  window.v8MarkReady=async function(...args){await legacyReady(...args);legacyWeekBoard?.()};

  window.v12TbmTab=function(mode='lookup'){
    moveLegacyViews();if(typeof requireSite==='function'&&!requireSite())return;
    show('tbm');
    el('v7_tbm_write')?.classList.toggle('hidden',mode!=='write');
    el('v7_tbm_lookup')?.classList.toggle('hidden',mode!=='lookup');
    el('v12TbmApprovalsInline')?.classList.toggle('hidden',mode!=='approvals');
    document.querySelectorAll('[data-v12-tbm]').forEach(b=>b.classList.toggle('active',b.dataset.v12Tbm===mode));
    if(mode==='approvals')loadV8TbmApprovals();
    else if(mode==='lookup')loadTbms();
    else{loadContractors();loadRisks()}
  };
  window.v7TbmTab=mode=>window.v12TbmTab(mode);
  window.v8TbmApprovalTab=()=>window.v12TbmTab('approvals');
  window.v8ActionTab=function(mode){legacyActionTab(mode);el('v12ActionNav')?.classList.add('on');document.querySelectorAll('[data-v12-action]').forEach(b=>b.classList.toggle('active',b.dataset.v12Action===mode))};

  moveLegacyViews();
  const version=el('releaseVersion');if(version)version.textContent='SAFETY WORKSPACE · V14 / 현장업무 통합 정리';
  window.v12Workspace={renderFocus,findWeekDoc,labels};
})();
