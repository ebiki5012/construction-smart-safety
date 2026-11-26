/* V20: actual task-separated mobile layout. Move existing nodes, never clone form IDs or bypass permissions. */
(()=>{'use strict';
const $id=id=>document.getElementById(id), app=$id('app'), weekly=$id('weekly');
if(!app||!weekly)return;
const mq=matchMedia('(max-width:900px)'), isMobile=()=>mq.matches;
const tabs=weekly.querySelector('.v12-task-tabs'), sidebar=weekly.querySelector('.v12-document-sidebar'), setup=$id('v16ApproverSetup'), queue=$id('v16CompanyQueue'), focus=$id('v12Focus');
const write=$id('v12PanelWrite'), compose=$id('v12PanelCompose'), doc=$id('v12PanelDocument');
const moved=[];
const submitGroup=weekly.querySelector(".v9-submit-group");
function anchor(node){const mark=document.createComment('v20 original location');node.before(mark);moved.push([node,mark]);return node;}
for(const node of [tabs,sidebar,setup,queue,focus,submitGroup])anchor(node);
const listBox=document.createElement('details');listBox.className='v20-doc-list v20-mobile-only';listBox.innerHTML='<summary>지난 평가서 찾기</summary>';
const routeBox=document.createElement('details');routeBox.className='v20-route-settings v20-mobile-only';routeBox.innerHTML='<summary>현장 결재선 관리</summary>';
$id('companies').prepend(routeBox);
const companyHistoryBox=document.createElement('details');companyHistoryBox.className='v20-company-history v20-mobile-only';companyHistoryBox.innerHTML='<summary>협력사별 제출·승인 현황</summary>';doc.append(companyHistoryBox);
const routeReadBox=document.createElement('details');routeReadBox.className='v20-route-read v20-mobile-only';routeReadBox.innerHTML='<summary>현재 현장 결재선 확인</summary>';doc.append(routeReadBox);
const shortNames={write:'작성',lookup:'기록',compose:'상신·승인',document:'결재'};
for(const b of tabs.querySelectorAll('button')){const span=document.createElement('span');span.className='v20-tab-label';span.textContent=shortNames[b.dataset.v12Mode];b.append(span);b.setAttribute('aria-label',b.dataset.v12Mode==='compose'?'취합·상신 및 협력사 승인':span.textContent);}
// Keep original desktop labels, use only the compact labels on phones.
for(const b of tabs.querySelectorAll('button'))for(const n of [...b.childNodes])if(n.nodeType===3&&n.textContent.trim()){const s=document.createElement('span');s.className='v20-desktop-label';s.textContent=n.textContent.trim();n.replaceWith(s);}
const dateBox=document.createElement('details');dateBox.className='v20-date-box v20-mobile-only';dateBox.innerHTML='<summary><span><b>작성일 · 적용기간</b><small id="v20DateSummary">날짜 확인</small></span><span class="v20-date-edit">변경</span></summary><div class="v20-date-fields"></div>';
const dates=['rd','riskPeriodStart','riskPeriodEnd'].map(id=>anchor($id(id).parentElement));
const riskForm=$id('v7_risk_write').querySelector('.form');riskForm.before(dateBox);
const pair=document.createElement('div');pair.className='v20-risk-pair v20-mobile-only';
const ratings=['rf','rs'].map(id=>anchor($id(id).parentElement));ratings[0].before(pair);
const ratingNotes=['rf','rs'].map(id=>{const select=$id(id),note=document.createElement('small');note.className='v20-rating-note v20-mobile-only';select.after(note);const update=()=>{const text=select.selectedOptions[0]?.textContent||'';note.textContent=text.length>11?text:'';note.classList.toggle('hidden',!note.textContent);};select.addEventListener('change',update);new MutationObserver(update).observe(select,{childList:true});return update;});
const dateSummary=()=>{const vals=['rd','riskPeriodStart','riskPeriodEnd'].map(id=>$id(id).value);const years=new Set(vals.filter(Boolean).map(v=>v.slice(0,4)));const short=s=>s?(years.size>1?s:s.slice(5)).replaceAll('-','.'):'미지정';$id('v20DateSummary').textContent=`${short(vals[0])} · ${short(vals[1])} ~ ${short(vals[2])}`;};
for(const id of ['rd','riskPeriodStart','riskPeriodEnd'])$id(id).addEventListener('change',dateSummary);
const setupLink=document.createElement('button');setupLink.type='button';setupLink.className='v20-mobile-only v20-settings-link';setupLink.textContent='현장 결재선 관리';setupLink.onclick=()=>{if(typeof v8IsManager==='function'&&v8IsManager()){show('companies');routeBox.open=true;window.v16Refresh?.();window.scrollTo(0,0);}};compose.insertBefore(setupLink,compose.firstChild);
const documentLink=setupLink.cloneNode(true);documentLink.onclick=setupLink.onclick;doc.prepend(documentLink);
function mode(){return ['Write','Lookup','Compose','Document','Template'].find(n=>!$id('v12Panel'+n).classList.contains('hidden'))?.toLowerCase()||'write';}
function sync(){const m=mode();weekly.dataset.v20Mode=m;dateSummary();ratingNotes.forEach(fn=>fn());const manager=typeof v8IsManager==='function'&&v8IsManager();for(const b of [setupLink,documentLink,routeBox])b.classList.toggle('hidden',!manager);routeReadBox.classList.toggle('hidden',manager);if(isMobile()){const routeHost=manager?routeBox:routeReadBox;if(setup.parentElement!==routeHost)routeHost.append(setup);if(m==='document'){if(queue.parentElement!==companyHistoryBox)companyHistoryBox.append(queue);}else if(queue.parentElement!==compose){compose.insertBefore(queue,$id('reviewCompose'));companyHistoryBox.open=false;}}const register=app.querySelector('[data-v12-action="register"]');if(register)register.classList.toggle('hidden',!manager);const active=app.querySelector('.page:not(.hidden)')?.id;if(active==='companies'&&isMobile()&&manager&&!routeBox.contains(setup))routeBox.append(setup);for(const b of app.querySelectorAll('.v19-bottom [data-v19-page]')){const key=b.dataset.v19Page;if(key==='more')continue;const nav=app.querySelector(`.nav button[data-p="${key}"]`);b.classList.toggle('hidden',!nav||nav.classList.contains('hidden'));}if(active==='weekly'&&m!=='document')listBox.open=false;}
function layout(){if(isMobile()){
  weekly.insertBefore(tabs,weekly.querySelector('.v12-main-layout'));
  doc.prepend(listBox);listBox.append(sidebar);listBox.after(focus);focus.after(documentLink);
  compose.insertBefore(queue,$id('reviewCompose'));routeBox.append(setup);weekly.querySelector('.v9-compose-preview-pane').after(submitGroup);
  for(const node of dates)dateBox.querySelector('.v20-date-fields').append(node);
  for(const node of ratings)pair.append(node);
}else{for(const [node,mark] of moved)mark.after(node);}
sync();}
for(const n of ['Write','Lookup','Compose','Document','Template'])new MutationObserver(sync).observe($id('v12Panel'+n),{attributes:true,attributeFilter:['class']});
for(const p of app.querySelectorAll('.page'))new MutationObserver(sync).observe(p,{attributes:true,attributeFilter:['class']});
for(const n of app.querySelectorAll('.nav button[data-p]'))new MutationObserver(sync).observe(n,{attributes:true,attributeFilter:['class']});
new MutationObserver(sync).observe($id('who'),{childList:true});
// Navigate from the task header, not to a hidden summary. Selecting a past document closes the list.
tabs.addEventListener('click',()=>{if(isMobile())requestAnimationFrame(()=>window.scrollTo(0,0));});
sidebar.addEventListener('click',e=>{if(isMobile()&&e.target.closest('[data-review-id],#v12CurrentWeek')){listBox.open=false;requestAnimationFrame(()=>window.scrollTo(0,0));}});
app.addEventListener('click',e=>{if(!isMobile())return;if(e.target.closest('.nav button[data-p],.v19-bottom button:not([data-v19-page="more"])')){const side=app.querySelector('.side');if(side.classList.contains('v8-nav-open'))$id('v8MobileMenu')?.click();requestAnimationFrame(()=>window.scrollTo(0,0));}requestAnimationFrame(()=>{dateSummary();ratingNotes.forEach(fn=>fn());});});
for(const b of app.querySelectorAll('[data-v8-shortcut]')){const original=b.onclick,key=b.dataset.v8Shortcut;b.onclick=function(e){if(!isMobile())return original?.call(this,e);if(key==='weekly')window.v12OpenWorkspace('write');else if(key==='tbm')window.v12TbmTab('write');else window.v8ActionTab('open');window.scrollTo(0,0);};}
// Photo controls use the original upload input and the V19 camera bridge. Keep count and allow clearing.
for(const id of ['riskPhotos','tbmPhotos','actionBeforePhotos']){
 const input=$id(id),tools=input?.nextElementSibling;if(!tools?.classList.contains('v19-photo-tools'))continue;
 const choose=document.createElement('button');choose.type='button';choose.textContent='사진 선택';choose.onclick=()=>input.click();
 const clear=document.createElement('button');clear.type='button';clear.textContent='첨부 취소';clear.className='v20-photo-clear';clear.onclick=()=>{input.value='';input.dispatchEvent(new Event('change',{bubbles:true}));};
 const count=tools.querySelector('small');tools.insertBefore(choose,count);tools.append(clear);input.classList.add('v20-native-photo');
 const update=()=>{const files=[...input.files];count.textContent=files.length?`${files.length}장 선택`:'선택한 사진 없음';clear.hidden=!files.length;};input.addEventListener('change',update);update();
 const saveName={riskPhotos:'saveRisk',tbmPhotos:'saveTbm',actionBeforePhotos:'saveAction'}[id],original=window[saveName];window[saveName]=async function(...args){const files=[...input.files];if(files.length>5||files.some(f=>f.size>8*1024*1024||!['image/jpeg','image/png','image/webp'].includes(f.type)))return toast('사진은 JPG·PNG·WEBP 최대 5장, 장당 8MB 이하로 선택하세요.');try{return await original.apply(this,args)}finally{update();}};
}
// Convert only plain record tables to labeled mobile rows; preserve original cells, buttons and events.
for(const id of ['riskTable','historyTable']){
 const host=$id(id);if(!host)continue;
 const annotate=()=>{for(const table of host.querySelectorAll('table')){const headers=[...table.querySelectorAll('tr:first-child th')].map(x=>x.textContent.trim());if(!headers.length)continue;table.classList.add('v20-record-table');for(const row of table.querySelectorAll('tr')){const cells=[...row.children].filter(x=>x.tagName==='TD');if(cells.length!==headers.length)continue;cells.forEach((cell,i)=>cell.dataset.v20Label=headers[i]);}}};
 new MutationObserver(annotate).observe(host,{childList:true,subtree:true});annotate();
}
// Give existing inputs accessible names without replacing or resetting values.
for(const field of app.querySelectorAll('.form > div')){const label=field.querySelector(':scope > label'),input=field.querySelector(':scope > input[id],:scope > select[id],:scope > textarea[id]');if(label&&input&&!label.htmlFor)label.htmlFor=input.id;}
// Mobile-only source links need to show the matching action list, not the new-registration form.
const originalSource=window.v8OpenSource;
if(typeof originalSource==='function')window.v8OpenSource=async function(type,id,siteId){if(!isMobile()||type!=='action')return originalSource.apply(this,arguments);await originalSource.apply(this,arguments);const row=app.querySelector(`#actionTable [data-record-id="${Number(id)}"]`);const done=row?.querySelector('.v14-action-state.waiting,.v14-action-state.verified');window.v8ActionTab(done?'verify':'open');await loadActions();app.querySelector(`#actionTable [data-record-id="${Number(id)}"]`)?.scrollIntoView({block:'center'});};
// Preserve all existing actions on desktop and restore DOM on resize.
mq.addEventListener('change',layout);layout();
$id('releaseVersion').textContent='V20 · 모바일 업무 분리';
})();
