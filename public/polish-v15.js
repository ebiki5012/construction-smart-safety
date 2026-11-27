/* V15 · 사용자/사진/표준평가: 업무 출처가 먼저, 행동은 명확하게 */
'use strict';
const v15RoleNames={ADMIN:'최고관리자',MANAGER:'현장관리자',USER:'일반 사용자',CONTRACTOR_MANAGER:'협력사 관리자',SAFETY_MANAGER:'원청 안전관리자',SITE_DIRECTOR:'원청 현장소장'};
const v15Date=v=>String(v||'').slice(0,10)||'-';
const v15TypeNames={risk:'위험성평가',tbm:'TBM',action:'지적·조치관리',custom:'사용자 양식'};

// 사용자 관리는 이 화면 한 곳에서 처리한다. 삭제는 기록 보존형 보관으로 구현.
function renderUsers(){
 const filter=$('userFilter')?.value||'active';
 const term=String($('userSearch')?.value||'').trim().toLocaleLowerCase('ko');
 const all=Array.isArray(userRows)?userRows:[];
 const counts={total:all.length,active:all.filter(u=>u.active&&!u.archived_at).length,inactive:all.filter(u=>!u.active&&!u.archived_at).length,archived:all.filter(u=>!!u.archived_at).length};
 const stats=$('v15UserStats');
 if(stats)stats.innerHTML=`<div><span>전체 등록</span><strong>${counts.total}<small>명</small></strong></div><div><span>사용 중</span><strong>${counts.active}<small>명</small></strong></div><div><span>사용 중지</span><strong>${counts.inactive}<small>명</small></strong></div><div><span>보관된 계정</span><strong>${counts.archived}<small>명</small></strong></div>`;
 const rows=all.filter(u=>{
  if(filter==='active'&&(!u.active||u.archived_at))return false;
  if(filter==='inactive'&&(u.active||u.archived_at))return false;
  if(filter==='archived'&&!u.archived_at)return false;
  const values=[u.name,u.email,u.username||'',...(u.sites||[]).map(s=>[s.site_name,s.contractor_name].join(" "))];
  return !term||values.join(' ').toLocaleLowerCase('ko').includes(term);
 });
 const host=$('userTable');if(!host)return;
 host.innerHTML=`<div class="v15-list-count">검색 결과 <b>${rows.length}명</b> <span>· 사용자 정보와 현장 권한을 선택해 수정할 수 있습니다.</span></div>`+
 (rows.length?`<div class="v15-user-rows">${rows.map(u=>{
  const status=u.archived_at?'보관됨':u.active?'사용 중':'사용 중지';
  const statusClass=u.archived_at?'archived':u.active?'active':'inactive';
  const initial=esc(String(u.name||'?').trim().slice(0,1));
  const sites=(u.sites||[]).slice(0,3).map(s=>`<span class="v15-site-pill">${esc(s.site_name)} · ${esc(s.contractor_name||(["USER","CONTRACTOR_MANAGER"].includes(s.site_role)?"업체 미지정":"원청"))} <small>${esc(v15RoleNames[s.site_role]||s.site_role)}</small></span>`).join('');
  const more=(u.sites||[]).length>3?`<span class="v15-site-pill">+${u.sites.length-3}곳</span>`:'';
  return `<article class="v15-user-row" data-user-id="${Number(u.id)}"><div class="v15-user-avatar" aria-hidden="true">${initial}</div><div class="v15-user-info"><div class="v15-user-name"><strong>${esc(u.name)}</strong><span class="v15-user-state ${statusClass}">${status}</span><span class="v15-user-role">${esc(v15RoleNames[u.role]||u.role)}</span></div><div class="v15-user-login">${esc(u.username||'아이디 미설정')} <span>·</span> ${esc(String(u.email||'').endsWith('@account.invalid')?'아이디 로그인':u.email)}</div><div class="v15-user-sites">${sites}${more||(!sites?'<span class="v15-site-empty">배정 현장 없음</span>':'')}</div></div><div class="v15-user-actions"><button type="button" onclick="openUserModal(${Number(u.id)})">${u.archived_at?'상세·복구':'정보·권한 수정'}</button>${u.archived_at?'':`<button type="button" class="v15-user-archive-shortcut" onclick="v15OpenArchive(${Number(u.id)})">계정 보관</button>`}</div></article>`;
 }).join('')}</div>`:'<div class="v15-empty-state">해당 조건의 사용자가 없습니다. 검색어 또는 계정 상태를 변경해 보세요.</div>');
}
function drawUserModal(){
 const u=currentSelected();if(!u)return;
 const archived=!!u.archived_at;
 $('modalTitle').textContent=`${u.name} · 사용자 관리`;
 $('v15UserModalMeta').textContent=`${u.username||u.email} · ${v15RoleNames[u.role]||u.role} · ${archived?'보관된 계정':u.active?'사용 중':'사용 중지'}`;
 $('editName').value=u.name||'';$('editEmail').value=u.email||'';$('editUsername').value=u.username||'';$('editRole').value=u.role;
 const assign=$('assignSite');assign.innerHTML=sites.map(s=>`<option value="${Number(s.id)}">${esc(s.name)}</option>`).join('');
 const assignments=(u.sites||[]);
 $('assignedSites').innerHTML=assignments.length?assignments.map(s=>`<div class="v15-assigned-row"><div><strong>${esc(s.site_name)}</strong><small>${esc(v15RoleNames[s.site_role]||s.site_role)} · ${esc(s.contractor_name||(["USER","CONTRACTOR_MANAGER"].includes(s.site_role)?"업체 미지정":"원청"))}</small></div><div class="v21-assignment-actions"><button type="button" ${archived?'disabled':''} onclick="v21EditAssignment(${Number(s.site_id)})">소속·권한 수정</button><button type="button" ${archived?'disabled':''} onclick="unassignUserSite(${Number(s.site_id)})">배정 해제</button></div></div>`).join(''):'<div class="v15-assigned-empty">현재 배정된 현장이 없습니다.</div>';
 const status=$('statusBtn');status.textContent=u.active?'계정 사용 중지':'계정 활성화';status.disabled=archived;status.classList.toggle('v15-activate',!u.active);
 $('v15RestoreUserBtn').classList.toggle('hidden',!archived);
 $('v15ArchiveBox').classList.toggle('hidden',archived);
 $('v15ArchivedInfo').classList.toggle('hidden',!archived);
 if(archived)$('v15ArchivedInfo').innerHTML=`<strong>보관일</strong> ${esc(v15Date(u.archived_at))}<div><strong>사유</strong> ${esc(u.archive_reason||'-')}</div><p>복구하면 사용 중지 상태가 됩니다. 다시 로그인하도록 하려면 계정 활성화를 선택하세요.</p>`;
 window.v21SyncCompany?.("assign");
 for(const id of ['editName','editEmail','editUsername','editRole','assignSite','assignRole','resetPw','v15SaveUserBtn','v15AssignUserBtn','v15ResetPwBtn','v15ArchiveReason','v15ArchiveUserBtn'])$(id).disabled=archived;
}
function v15OpenArchive(id){openUserModal(id);setTimeout(()=>{const node=$('v15ArchiveBox');if(node&&!node.classList.contains('hidden'))node.scrollIntoView({behavior:'smooth',block:'center'});},40)}
async function v15ArchiveUser(){
 const u=currentSelected();if(!u||u.archived_at)return;
 const reason=$('v15ArchiveReason').value.trim();
 if(reason.length<5)return toast('계정 보관 사유를 5자 이상 입력하세요.');
 if(Number(u.id)===Number(me?.id))return toast('본인 계정은 보관할 수 없습니다.');
 if(!confirm(`${u.name} 계정을 보관할까요?\n로그인이 차단되고 사용자 목록에서 숨겨집니다.\n기존 위험성평가·TBM·결재 기록은 그대로 보존됩니다.`))return;
 try{
  await api(`/api/users/${Number(u.id)}`,{method:'DELETE',body:JSON.stringify({reason})});
  $('v15ArchiveReason').value='';$('userFilter').value='archived';
  toast('계정을 보관했습니다. 기존 기록은 유지됩니다.');await refreshSelected();
 }catch(e){toast(e.message)}
}
async function v15RestoreUser(){
 const u=currentSelected();if(!u||!u.archived_at)return;
 if(!confirm(`${u.name} 계정을 복구할까요?\n복구 후 계정 활성화 버튼을 누르면 다시 로그인할 수 있습니다.`))return;
 try{
  await api(`/api/users/${Number(u.id)}/restore`,{method:'POST',body:'{}'});
  $('userFilter').value='inactive';toast('계정 복구 완료. 로그인하려면 계정 활성화를 선택하세요.');await refreshSelected();
 }catch(e){toast(e.message)}
}

// 사진 보관함: 원본 기록/유형을 가장 먼저 표시하고, 이미지는 선택 가능한 작은 미리보기로.
let v15LibraryItems=[],v15LibrarySize='sm',v15LibraryLayout='list';
function setupLibrary(){
 const select=$('librarySite');if(!select)return;
 const previous=select.value;
 select.innerHTML=(me.role==='ADMIN'?'<option value="all">전체 현장</option>':'')+sites.map(s=>`<option value="${Number(s.id)}">${esc(s.name)}</option>`).join('');
 const wanted=previous&&(previous==='all'||sites.some(s=>String(s.id)===previous))?previous:(sid||String(sites[0]?.id||''));
 select.value=wanted;
 v15UpdatePhotoControls();loadLibrary();
}
function v15UpdatePhotoControls(){
 const host=$('libraryResults');if(!host)return;
 host.dataset.size=v15LibrarySize;host.dataset.layout=v15LibraryLayout;
 document.querySelectorAll('[data-v15-size]').forEach(b=>{const on=b.dataset.v15Size===v15LibrarySize;b.classList.toggle('on',on);b.setAttribute('aria-pressed',String(on))});
 document.querySelectorAll('[data-v15-layout]').forEach(b=>{const on=b.dataset.v15Layout===v15LibraryLayout;b.classList.toggle('on',on);b.setAttribute('aria-pressed',String(on))});
}
function v15SetPhotoSize(size){if(!['sm','md','lg'].includes(size))return;v15LibrarySize=size;v15UpdatePhotoControls()}
function v15SetPhotoLayout(layout){if(!['list','grid'].includes(layout))return;v15LibraryLayout=layout;v15UpdatePhotoControls()}
function v15PhotoUrl(f,action='view'){
 const id=Number(f.id);if(!Number.isSafeInteger(id)||id<1)return '#';
 return f.record_type==='custom'?`/api/custom/photos/${id}/${action}`:`/api/photos/${id}/${action}`;
}
function renderV15Library(){
 const host=$('libraryResults'),summary=$('v15LibrarySummary');if(!host)return;
 const rows=v15LibraryItems;
 const counts={risk:0,tbm:0,action:0,custom:0};rows.forEach(f=>{if(Object.hasOwn(counts,f.record_type))counts[f.record_type]++});
 if(summary)summary.innerHTML=`<strong>조회된 사진 ${rows.length}장</strong><span>위험성평가 ${counts.risk}</span><span>TBM ${counts.tbm}</span><span>조치관리 ${counts.action}</span><span>사용자 양식 ${counts.custom}</span>`;
 host.innerHTML=rows.length?`<div class="v15-photo-rows">${rows.map(f=>{
  const type=Object.hasOwn(v15TypeNames,f.record_type)?f.record_type:'custom';
  const title=esc(f.source_title||'기록 제목 없음');
  const stage=f.photo_stage==='before'?' · 조치 전':f.photo_stage==='after'?' · 조치 후':'';
  const source=type!=='custom'?`<button type="button" class="v15-photo-source" onclick="v8OpenSource('${type}',${Number(f.record_id)},${Number(f.site_id)})">연결 기록 보기</button>`:'';
  return `<article class="v15-photo-row"><div class="v15-photo-origin"><span class="v15-origin-badge ${type}">${v15TypeNames[type]}${stage}</span><span class="v15-photo-site">${esc(f.site_name||'-')}</span><h4>${title}</h4><div class="v15-photo-meta"><span>기록 #${Number(f.record_id)||'-'}</span><span>${type==='action'?'조치기한':'기록일'} ${esc(v15Date(f.source_date))}</span><span>사진 등록 ${esc(v15Date(f.created_at))}</span><span>등록자 ${esc(f.uploader_name||'-')}</span></div><div class="v15-photo-file">${esc(f.original_name||'원본 파일')}</div></div><a class="v15-photo-preview" href="${v15PhotoUrl(f)}" target="_blank" rel="noopener" title="사진 확대 보기"><img loading="lazy" src="${v15PhotoUrl(f)}" alt="${title} 첨부 사진" onerror="this.style.opacity='.25'"></a><div class="v15-photo-links">${source}<a href="${v15PhotoUrl(f,'download')}">원본 다운로드</a></div></article>`;
 }).join('')}</div>`:'<div class="v15-empty-state">검색 조건에 맞는 사진이 없습니다. 현장·업무 종류·기간을 확인하세요.</div>';
 v15UpdatePhotoControls();
}
async function loadLibrary(){
 const host=$('libraryResults');if(!host)return;
 host.innerHTML='<div class="v15-empty-state">사진 기록을 불러오는 중입니다.</div>';
 try{
  const p=libraryParams();const rows=await api('/api/photo-library?'+p.toString());
  v15LibraryItems=Array.isArray(rows)?rows:[];
  renderV15Library();await loadLibraryUsage();
 }catch(e){v15LibraryItems=[];host.innerHTML=`<div class="v15-empty-state">${esc(e.message)}</div>`;toast(e.message)}
}

// 표준평가: 제목/위험요인/대책을 한 번에 훑고 명확한 버튼으로 작성 화면에 적용.
let v15Templates=[];
async function loadTemplates(){
 const host=$('templates');if(!host)return;
 host.innerHTML='<div class="v15-empty-state">표준평가를 불러오는 중입니다.</div>';
 try{
  v15Templates=await api(`/api/templates?site_id=${sid}`);
  const area=$('v15TemplateArea'),previous=area?.value||'';
  if(area){const values=[...new Set(v15Templates.map(x=>String(x.area||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ko'));
   area.innerHTML='<option value="">전체 공종·구역</option>'+values.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');area.value=values.includes(previous)?previous:'';}
  renderV15Templates();
 }catch(e){host.innerHTML=`<div class="v15-empty-state">${esc(e.message)}</div>`;toast(e.message)}
}
function renderV15Templates(){
 const host=$('templates');if(!host)return;
 const term=String($('v15TemplateSearch')?.value||'').trim().toLocaleLowerCase('ko');
 const area=$('v15TemplateArea')?.value||'';
 const rows=v15Templates.filter(x=>(!area||x.area===area)&&(!term||[x.name,x.area,x.work,x.hazard,x.measure].join(' ').toLocaleLowerCase('ko').includes(term)));
 $('v15TemplateCount').innerHTML=`표준평가 <strong>${rows.length}건</strong> <span>/ 전체 ${v15Templates.length}건 · 선택하면 작성 화면에 위험요인과 감소대책이 자동 입력됩니다.</span>`;
 host.innerHTML=rows.length?`<div class="v15-template-list">${rows.map(x=>{
  const id=Number(x.id),level=String(x.level||'');
  const levelClass=level==='높음'?'high':level==='보통'?'mid':'low';
  return `<article class="v15-template-card"><div class="v15-template-card-top"><div><span class="v15-template-area">${esc(x.area||'공종·구역 미지정')}</span><h4>${esc(x.name||x.work||'표준평가')}</h4><p>${esc(x.work||'작업명 미지정')}</p></div><span class="v15-template-score ${levelClass}">${Number(x.score)||'-'}점 · ${esc(level||'-')}</span></div><div class="v15-template-facts"><div><span>위험요인</span><p>${esc(x.hazard||'미입력')}</p></div><div><span>감소대책</span><p>${esc(x.measure||'미입력')}</p></div></div><div class="v15-template-bottom"><span>빈도 ${Number(x.frequency)||'-'} × 강도 ${Number(x.severity)||'-'}</span><button type="button" onclick="v15UseTemplate(${id})">이 평가서에 불러오기</button></div></article>`;
 }).join('')}</div>`:'<div class="v15-empty-state">조건에 맞는 표준평가가 없습니다. 검색어를 바꾸거나 기존 위험요인을 표준평가로 저장하세요.</div>';
}
async function v15UseTemplate(id){
 const x=v15Templates.find(t=>Number(t.id)===Number(id));if(!x)return toast('표준평가를 찾을 수 없습니다.');
 const site=String(sid);v12ShowMode('write');
 try{await loadSettings();}catch(e){return toast('평가 기준을 불러오지 못했습니다. 다시 시도하세요.');}
 if(String(sid)!==site)return;
 for(const [key,value] of Object.entries({ra:x.area,rw:x.work,rh:x.hazard,rf:x.frequency,rs:x.severity,rm:x.measure})){
  const node=$(key);if(node){node.value=value??'';if(key==='rf'||key==='rs')node.dispatchEvent(new Event('change',{bubbles:true}));}
 }
 const notice=$('v15TemplateApplied');if(notice){notice.classList.remove('hidden');notice.innerHTML=`<strong>✓ ${esc(x.name||x.work||'표준평가')} 불러오기 완료</strong><span>협력업체·작성일·적용기간을 확인하고 저장하세요. 아직 저장된 기록은 아닙니다.</span>`;}
 $('ra')?.scrollIntoView({behavior:'smooth',block:'center'});
 toast('표준평가 내용을 작성 화면에 불러왔습니다. 업체와 기간을 확인하세요.');
}
function useTpl(x){if(x&&typeof x==='object'){if(!v15Templates.some(t=>Number(t.id)===Number(x.id)))v15Templates.push(x);v15UseTemplate(x.id)}}
