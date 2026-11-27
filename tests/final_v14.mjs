import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const read=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
const html=read('public/index.html');
const workspace=read('public/workspace-v12.js');
const css=read('public/final-v14.css');
const server=read('server.js');
assert(html.includes('/final-v14.css?v=20261123-01'),'final UI asset must be versioned');
assert(html.includes('V18 · 현장별 결재선 관리'),'release label must be visible');
assert(server.includes("version:'24.0.0'")&&server.includes("ui:'field-workspace-v24'"),'version endpoint must identify final release');
assert(html.includes('id="v14ActionOverview"'),'action overview counts missing');
assert(css.includes('v14-action-card')&&css.includes('@media(max-width:650px)'),'responsive action cards missing');
assert(!html.includes('class="section v13-action-photo-help"'),'duplicate photo instructions should be removed');
assert(workspace.includes("if(top)top.innerHTML='';"),'redundant top action should be removed');
assert(workspace.includes('작성된 위험요인을 확인한 뒤 취합·상신하세요'),'draft next step must be clear');
assert(workspace.includes('처리 완료 · 추가 결재가 필요하지 않습니다.'),'approved documents must not ask for another decision');
assert(workspace.includes('data-v12-action="open"')&&workspace.includes('data-v12-action="register"'),'action tasks must be on one page');
assert(workspace.includes('data-v12-tbm="lookup"')&&workspace.includes('data-v12-tbm="approvals"'),'TBM tasks must remain accessible');
new vm.Script(workspace,{filename:'workspace-v12.js'});
const actionSource=html.slice(html.indexOf('async function loadActions(){'),html.indexOf('async function done(id){'));
const renderActions=vm.runInNewContext('('+actionSource.trim()+')',{
  $:id=>dom[id],
  api:async()=>records,
  sid:4,
  v8ActionMode:'open',
  esc:s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])),
  companyDisplay:r=>r.contractor_name,
  v8IsManager:()=>true,
  me:{role:'ADMIN'}
});
const dom={v14ActionOverview:{innerHTML:''},actionTable:{innerHTML:''}};
const records=[
  {id:1,status:'OPEN',contractor_name:'A건설',issue_text:'난간 미설치',item:'안전난간 설치',manager:'김담당',due_date:'2026-11-24',author_name:'이작성'},
  {id:2,status:'DONE',contractor_name:'B건설',issue_text:'통로 정리',item:'정리 완료',manager:'박담당',verified_at:null},
  {id:3,status:'DONE',contractor_name:'B건설',issue_text:'보호구',item:'착용 확인',verified_at:'2026-11-22'}
];
await renderActions();
assert.match(dom.v14ActionOverview.innerHTML,/미조치·진행 중/);
assert.match(dom.v14ActionOverview.innerHTML,/확인 완료/);
assert.match(dom.actionTable.innerHTML,/난간 미설치/);
assert(!dom.actionTable.innerHTML.includes('통로 정리'),'open mode must not mix completed records');
assert.match(dom.actionTable.innerHTML,/사진 확인·추가/);
assert.match(dom.actionTable.innerHTML,/지적사항 #1/);
assert.match(dom.actionTable.innerHTML,/기록 관리/);
const photoSource=html.slice(html.indexOf('async function openPhotos(type,id){'),html.indexOf('function closePhotoModal(){'));
const photoDom={photoStage:{value:'after',classList:{toggle(){}}},photoStageLabel:{classList:{toggle(){}}},photoModal:{classList:{remove(){}}},photoTitle:{textContent:''}};
const openPhotos=vm.runInNewContext('('+photoSource.trim()+')',{
  photoTarget:null,$:id=>photoDom[id],refreshPhotos:async()=>{}
});
await openPhotos('action',1);
assert.equal(photoDom.photoStage.value,'before','opening another finding must not inherit after-photo stage');
const focusSource=workspace.slice(workspace.indexOf('function renderFocus(record,items) {'),workspace.indexOf('function renderDraft() {'));
const focusDom={
  v12Focus:{innerHTML:''},v12WeekStatus:{textContent:''},v12CurrentWeekLabel:{textContent:''},v12CurrentWeekHint:{textContent:''},
  v12CurrentWeek:{classList:{toggle(){}}},v12TopAction:{innerHTML:'duplicated'}
};
const focus=vm.runInNewContext('('+focusSource.trim()+')',{
  el:id=>focusDom[id],currentWeek:()=> '2026-11-23',
  labels:{PENDING:'결재 대기',APPROVED:'승인 완료'},
  date:v=>String(v||'').slice(0,10),niceTime:v=>v||'-',safe:v=>String(v??''),
  canApprove:()=>true,window:{v11Approval:{stamp:()=>'<div>승인 도장</div>'}},v11Approval:{stamp:()=>'<div>승인 도장</div>'},
  state:{showingCurrent:true}
});
focus(null,[]);
assert.match(focusDom.v12Focus.innerHTML,/위험요인 작성/);
assert.equal(focusDom.v12TopAction.innerHTML,'');
focus({id:21,week_start:'2026-11-23',status:'PENDING',revision:1,item_count:2},[]);
assert.equal((focusDom.v12Focus.innerHTML.match(/이 평가서 최종 승인/g)||[]).length,1,'only one approval action');
focus({id:21,week_start:'2026-11-23',status:'APPROVED',revision:1,item_count:2},[]);
assert(!focusDom.v12Focus.innerHTML.includes('이 평가서 최종 승인'),'approved document must not show approve action');
assert.match(focusDom.v12Focus.innerHTML,/추가 결재가 필요하지 않습니다/);
console.log('PASS V14: status-first workspace, single decision, action cards and counts, safe photo stage, versioned release');
