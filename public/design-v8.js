/* V8 - 화면 구조와 입력 경험 개선. 기존 API, 권한검사, 저장 흐름은 사용한다. */
(() => {
  'use strict';
  const safe = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const day = v => String(v || '').slice(0, 10);
  const text = v => String(v ?? '').trim() || '기록 없음';
  const label = {risk:'위험성평가',tbm:'TBM',action:'지적·조치',custom:'사용자 양식'};
  const statusName = s => ({SUBMITTED:'승인 대기',APPROVED:'승인 완료',REJECTED:'반려',CANCELLED:'승인 취소',DRAFT:'작성 중'}[s] || '미상신');
  const companyName = r => r.contractor_name || (r.entry_mode==='PRIME'?'원청 자체 작성':'업체 연결 확인 필요');
  const statusClass = s => s === 'APPROVED'?'ok':s === 'REJECTED'||s === 'CANCELLED'?'bad':s === 'SUBMITTED'?'wait':'';
  const statusChip = (name, variant = '') => `<span class="v8-status ${variant}">${safe(name)}</span>`;
  let selectedRisk = null;
  let selectedTbm = null;
  let cleanupBusy = false;
  const canEdit = () => typeof me !== 'undefined' && me?.role === 'ADMIN';
  const buttons = (type, r) => {
    const id = Number(r.id);
    if (!Number.isSafeInteger(id) || id <= 0) return '';
    let html = '<div class="v8-detail-actions">';
    if (type === 'risk') html += `<button type="button" onclick="reuseRisk(${id})">↗ 평가 재사용</button>`;
    if (type === 'tbm') {
      if (!r.approval_status || r.approval_status === 'REJECTED') html += `<button type="button" onclick="submitV6('tbm',${id})">${r.approval_status === 'REJECTED'?'재상신':'결재 요청'}</button>`;
      html += `<button type="button" onclick="reuseTbm(${id})" class="v8-action-soft">다시 작성</button>`;
    }
    html += `<button type="button" class="v8-action-soft" onclick="openPhotos('${type}',${id})">사진 보기·첨부</button>`;
    if (canEdit()) html += `<button type="button" class="v8-action-soft" onclick="editRecord('${type}',${id})">기록 수정</button><button type="button" class="v8-action-alert" onclick="removeRecord('${type}',${id})">기록 정리</button>`;
    return html + '</div>';
  };
  const info = data => '<div class="v8-detail-info">' + data.map(([key,value]) => `<div><small>${safe(key)}</small><b>${safe(value || '-')}</b></div>`).join('') + '</div>';
  const section = (title, contents) => `<div class="v8-detail-section"><h4>${safe(title)}</h4><p>${safe(text(contents))}</p></div>`;
  const empty = (heading, hint) => `<div class="v8-empty"><strong>${safe(heading)}</strong><p>${safe(hint)}</p></div>`;
  const getRiskRows = () => {
    const rows = typeof v8RiskWeekRows !== 'undefined' && Array.isArray(v8RiskWeekRows) ? v8RiskWeekRows : [];
    const company = document.getElementById('v8RiskCompany')?.value || '';
    return rows.filter(r => !company || String(r.contractor_id) === company);
  };

  // 주차별 위험요인: 표를 선택형 기록 목록 + 상세 패널로 변경
  window.renderV8RiskWeek = function renderV8RiskWeek() {
    const host = document.getElementById('v8RiskGroups');
    if (!host) return;
    const rows = getRiskRows();
    const company = document.getElementById('v8RiskCompany')?.value || '';
    const summary = typeof v8RiskSummary !== 'undefined' && Array.isArray(v8RiskSummary) ? v8RiskSummary.filter(x => !company || String(x.id) === company) : [];
    const companies = new Set(rows.map(r => r.contractor_id ? String(r.contractor_id) : (r.contractor_name || '원청')));
    const high = rows.filter(r => Number(r.score || (Number(r.frequency)||0)*(Number(r.severity)||0)) >= 6 || r.level === '높음').length;
    const submitted = summary.filter(r => r.submitted_at).length;
    if (!rows.some(r => String(r.id) === String(selectedRisk))) selectedRisk = rows.length ? rows[0].id : null;
    host.innerHTML = `
      <div class="v8-record-overview" aria-label="선택 주차 평가 현황">
        <div class="v8-overview-item"><span>조회된 위험요인</span><strong>${rows.length}건</strong></div>
        <div class="v8-overview-item"><span>작성 업체</span><strong>${companies.size}개</strong></div>
        <div class="v8-overview-item"><span>높은 위험도</span><strong>${high}건</strong></div>
      </div>
      ${summary.length ? `<div class="v8-section-head"><h3>협력업체 작성 현황</h3><p>${submitted}/${summary.length}개 업체 작성 제출 · 최종 승인은 '주간 통합 결재'에서 확인</p></div><div class="v8-company-row">${summary.map(x => `<span class="v8-company-tag">${safe(x.name)} <b>${Number(x.risk_count)||0}건</b> ${statusChip(x.submitted_at?'제출':'미제출',x.submitted_at?'ok':'wait')}</span>`).join('')}</div>` : ''}
      <div class="v8-section-head"><h3>위험성평가 상세 조회</h3><p>왼쪽 기록을 누르면 오른쪽에 상세내용이 표시됩니다.</p></div>
      <div class="v8-record-browser">
        <div class="v8-record-list"><div class="v8-list-head"><b>평가 내역</b><span>${rows.length}건</span></div>${rows.length ? rows.map(r => `<button type="button" class="v8-record-choice ${String(r.id)===String(selectedRisk)?'is-selected':''}" aria-pressed="${String(r.id)===String(selectedRisk)}" data-v8-risk-id="${Number(r.id)}"><div class="v8-choice-top"><strong>${safe(r.work||r.area||'작업명 없음')}</strong>${statusChip(r.level||((Number(r.score)||0)>=6?'높음':'평가'),r.level==='높음'?'bad':'')}</div><div class="v8-choice-sub"><span>${safe(companyName(r))}</span><span>${safe(r.author_name||'작성자 미기록')}</span></div><span class="v8-choice-hazard">${safe(r.hazard||'위험요인 미기록')}</span></button>`).join('') : empty('해당 주차 기록이 없습니다','주차 또는 업체를 변경하거나 새 위험성평가를 작성해 주세요.')}</div>
        <div class="v8-record-detail" id="v8RiskDetail"></div>
      </div>
      <div class="v8-detail-actions"><button type="button" onclick="v7WeeklyTab('approval')">주간 통합 결재 확인 ↗</button><button type="button" class="v8-action-soft" onclick="v7RiskTab('write')">새 위험성평가 작성</button></div>`;
    host.querySelectorAll('[data-v8-risk-id]').forEach(btn => btn.addEventListener('click', () => window.v8ShowRisk(Number(btn.dataset.v8RiskId))));
    window.v8ShowRisk(selectedRisk);
  };
  window.v8ShowRisk = function v8ShowRisk(id) {
    selectedRisk = id;
    const list = getRiskRows();
    const r = list.find(x => String(x.id) === String(id));
    const host = document.getElementById('v8RiskDetail');
    if (!host) return;
    document.querySelectorAll('[data-v8-risk-id]').forEach(btn => {const selected=String(btn.dataset.v8RiskId)===String(id);btn.classList.toggle('is-selected',selected);btn.setAttribute('aria-pressed',String(selected))});
    if (!r) {host.innerHTML=empty('상세 기록을 선택해 주세요','왼쪽 목록에서 평가를 선택하면 내용이 나타납니다.');return}
    host.innerHTML = `<div class="v8-detail-eyebrow">위험성평가 · No. ${Number(r.id)||'-'}</div><h3 class="v8-detail-title">${safe(r.work||'작업명 미기록')}</h3><div class="v8-detail-sub">${statusChip(r.level||'위험도 미기록',r.level==='높음'?'bad':'')}<span>${safe(r.area||'구역 미기록')}</span></div>
      ${info([['협력업체',companyName(r)],['작성자',r.author_name||'-'],['작성일',day(r.risk_date)||'-'],['적용기간',`${day(r.period_start)||'-'} ~ ${day(r.period_end)||'-'}`],['위험도',`${Number(r.frequency)||'-'} (빈도) × ${Number(r.severity)||'-'} (강도) = ${Number(r.score)||'-'}점`],['작성방식',r.entry_mode==='PROXY'?'원청 대리 작성':r.entry_mode==='PRIME'?'원청 자체 작성':'협력업체 직접 작성']])}
      ${section('주요 위험요인',r.hazard)}${section('위험 감소대책',r.measure)}${buttons('risk',r)}`;
  };

  // 날짜 검색은 원래 filteredRecords를 그대로 사용하며 TBM 목록만 시각화한다.
  const originalRenderRecordList = window.renderRecordList;
  window.renderRecordList = function renderRecordList(type) {
    if (type !== 'tbm') return originalRenderRecordList(type);
    const host = document.getElementById('tbmTable');
    if (!host) return originalRenderRecordList(type);
    const list = filteredRecords('tbm');
    const allCount = Array.isArray(recordCache?.tbm) ? recordCache.tbm.length : list.length;
    document.getElementById('tbmCount').textContent = `조회 ${list.length}건 / 현장 전체 ${allCount}건 · 실시일 기준`;
    if (!list.some(r => String(r.id) === String(selectedTbm))) selectedTbm = list.length ? list[0].id : null;
    const pending = list.filter(r => r.approval_status === 'SUBMITTED').length;
    const approved = list.filter(r => r.approval_status === 'APPROVED').length;
    host.innerHTML = `<div class="v8-record-overview"><div class="v8-overview-item"><span>조회된 TBM</span><strong>${list.length}건</strong></div><div class="v8-overview-item"><span>승인 대기</span><strong>${pending}건</strong></div><div class="v8-overview-item"><span>승인 완료</span><strong>${approved}건</strong></div></div><div class="v8-record-browser"><div class="v8-record-list"><div class="v8-list-head"><b>TBM 기록 목록</b><span>${list.length}건</span></div>${list.length ? list.map(r => `<button type="button" class="v8-record-choice ${String(r.id)===String(selectedTbm)?'is-selected':''}" aria-pressed="${String(r.id)===String(selectedTbm)}" data-v8-tbm-id="${Number(r.id)}"><div class="v8-choice-top"><strong>${safe(r.work_name||r.team||'작업명 없음')}</strong>${statusChip(statusName(r.approval_status),statusClass(r.approval_status))}</div><div class="v8-choice-sub"><span>${safe(day(r.tbm_date)||'일자 없음')}</span><span>${safe(companyName(r))}</span></div><span class="v8-choice-hazard">${safe(r.hazard||'위험요인 미기록')}</span></button>`).join('') : empty('조회된 TBM이 없습니다','기간이나 검색어를 변경해 주세요.')}</div><div class="v8-record-detail" id="v8TbmDetailRead"></div></div><div class="v8-detail-actions"><button type="button" onclick="v7TbmTab('write')">새 TBM 작성</button><button type="button" class="v8-action-soft" onclick="v8TbmApprovalTab()">TBM 결재함 확인 ↗</button></div>`;
    host.querySelectorAll('[data-v8-tbm-id]').forEach(btn => btn.addEventListener('click', () => window.v8ShowTbm(Number(btn.dataset.v8TbmId))));
    window.v8ShowTbm(selectedTbm);
  };
  window.v8ShowTbm = function v8ShowTbm(id) {
    selectedTbm = id;
    const r = filteredRecords('tbm').find(x => String(x.id) === String(id));
    const host = document.getElementById('v8TbmDetailRead');
    if (!host) return;
    document.querySelectorAll('[data-v8-tbm-id]').forEach(btn => {const selected=String(btn.dataset.v8TbmId)===String(id);btn.classList.toggle('is-selected',selected);btn.setAttribute('aria-pressed',String(selected))});
    if (!r) {host.innerHTML=empty('TBM을 선택해 주세요','왼쪽 목록에서 기록을 클릭하면 상세정보가 나타납니다.');return}
    host.innerHTML = `<div class="v8-detail-eyebrow">TBM 실시 기록 · No. ${Number(r.id)||'-'}</div><h3 class="v8-detail-title">${safe(r.work_name||'작업명 미기록')}</h3><div class="v8-detail-sub">${statusChip(statusName(r.approval_status),statusClass(r.approval_status))}<span>${safe(day(r.tbm_date))}</span></div>${info([['협력업체',companyName(r)],['실시일',day(r.tbm_date)||'-'],['작성자',r.author_name||'-'],['팀·업체',r.team||'-'],['참석 인원',`${Number(r.people)||0}명`],['작성방식',r.entry_mode==='PROXY'?'원청 대리 작성':r.entry_mode==='PRIME'?'원청 자체 작성':'협력업체 직접 작성']])}${section('작업 위험요인',r.hazard)}${section('안전 조치·감소대책',r.measure)}${buttons('tbm',r)}`;
  };

  // 기록 정리 입력창: 브라우저 prompt 대신 항상 보이는 문서형 모달
  function dialog(title,subtitle,body,buttonsHtml) {
    const root = document.createElement('div');
    root.className='v8-overlay';root.setAttribute('role','presentation');
    root.innerHTML=`<div class="v8-dialog" role="dialog" aria-modal="true" aria-label="${safe(title)}"><div class="v8-dialog-head"><div><h2>${safe(title)}</h2><p>${safe(subtitle)}</p></div><button type="button" class="v8-dialog-close" aria-label="닫기">×</button></div>${body}<div class="v8-dialog-actions">${buttonsHtml}</div></div>`;
    document.body.appendChild(root);
    const close=()=>{root.remove();document.removeEventListener('keydown',onKey)};
    const onKey=e=>{if(e.key==='Escape'){e.preventDefault();close()}};
    document.addEventListener('keydown',onKey);
    root.querySelector('.v8-dialog-close').addEventListener('click',close);
    root.querySelector('[data-v8-cancel]').addEventListener('click',close);
    root.addEventListener('click',e=>{if(e.target===root)close()});
    return {root,close};
  }
  const findRecord = async (type,id) => {
    if (type==='risk'||type==='tbm') {
      const item=recordCache[type]?.find(r=>String(r.id)===String(id));
      if (item)return item;
    }
    return await recordFromList(type,Number(id));
  };
  window.removeRecord = async function removeRecord(type,id) {
    if (!canEdit()) return toast('최고관리자만 기록을 정리할 수 있습니다.');
    if (!label[type] || !Number.isSafeInteger(Number(id)) || Number(id)<=0) return;
    const doc = await findRecord(type,id).catch(()=>null);
    const details = [doc?.work||doc?.work_name||doc?.item||doc?.team||doc?.title,doc?.contractor_name,doc?.author_name].filter(Boolean).join(' · ');
    const {root,close}=dialog('기록 정리 · 휴지통 이동',`${label[type]} #${id} · 최고관리자 전용`,
      `<div class="v8-dialog-summary"><b>정리 대상</b><br>${safe(details || label[type]+' #'+id)}<br><span class="v8-dialog-note">기존 기록과 사진은 보존되며, 관리자 센터 휴지통에서 복원할 수 있습니다. 승인 완료 문서는 먼저 승인 취소해야 합니다.</span></div><label for="v8RemovalReason">정리 사유 (필수 · 5~500자)</label><textarea id="v8RemovalReason" name="reason" minlength="5" maxlength="500" placeholder="예: 결재 테스트를 위해 잘못 등록한 중복 TBM 기록 정리"></textarea><div class="v8-form-error" role="alert" aria-live="polite" id="v8RemovalError"></div>`,
      `<button type="button" class="cancel" data-v8-cancel>취소</button><button type="button" class="confirm-danger" id="v8RemovalConfirm" disabled>사유 기록 후 휴지통 이동</button>`);
    const field=root.querySelector('#v8RemovalReason'),confirm=root.querySelector('#v8RemovalConfirm'),error=root.querySelector('#v8RemovalError');
    field.focus();
    field.addEventListener('input',()=>{const n=field.value.trim().length;confirm.disabled=n<5||n>500;error.textContent=n>0&&n<5?'정리 사유를 5자 이상 적어 주세요.':''});
    confirm.addEventListener('click',async()=>{const reason=field.value.trim();if(reason.length<5||reason.length>500||cleanupBusy)return;cleanupBusy=true;confirm.disabled=true;confirm.textContent='정리 처리 중…';error.textContent='';try{await api(`/api/records/${type}/${Number(id)}`,{method:'DELETE',body:JSON.stringify({reason})});close();toast('기록이 휴지통으로 이동했습니다. 정리 이력과 사진은 보존됩니다.');refreshRecordPage(type);if(type==='risk')loadV8RiskWeek().catch(()=>{});}catch(e){error.textContent=e.message;confirm.disabled=false;confirm.textContent='사유 기록 후 휴지통 이동'}finally{cleanupBusy=false}});
  };

  // 최고관리자 편집: 필드마다 연속 prompt을 띄우는 방식 제거
  const fieldDefinitions={
    risk:[['risk_date','작성일','date'],['period_start','적용 시작일','date'],['period_end','적용 종료일','date'],['area','공종/구역'],['work','작업명'],['hazard','위험요인','textarea'],['frequency','빈도 (1~3)','number'],['severity','강도 (1~3)','number'],['measure','위험 감소대책','textarea']],
    tbm:[['tbm_date','실시일','date'],['team','팀·업체'],['work_name','작업명'],['people','참석 인원','number'],['hazard','위험요인','textarea'],['measure','안전 조치·감소대책','textarea']],
    action:[['item','조치내용','textarea'],['manager','담당자'],['due_date','조치기한','date'],['status','상태','status']],
    custom:[['record_date','기록일','date']]
  };
  window.editRecord = async function editRecord(type,id) {
    if (!canEdit()) return toast('최고관리자만 기록을 수정할 수 있습니다.');
    if (!fieldDefinitions[type]) return;
    let r;
    try{r=await findRecord(type,id)}catch(e){return toast(e.message)}
    if(!r)return toast('기록을 찾지 못했습니다.');
    const fields=[...fieldDefinitions[type]];
    let customFields=[];
    if(type==='custom'){
      const form=(typeof customForms!=='undefined'?customForms:[]).find(f=>f.id===currentFormId);
      customFields=(form?.fields||[]).filter(f=>f.field_type!=='photo').map(f=>({name:f.id,label:f.label}));
    }
    const inputHTML=fields.map(([name,title,kind])=>{
      const val=kind==='date'?day(r[name]):String(r[name]??'');
      const wide=kind==='textarea'?'wide':'';
      if(kind==='textarea')return `<div class="${wide}"><label for="v8-edit-${safe(name)}">${safe(title)}</label><textarea id="v8-edit-${safe(name)}" name="${safe(name)}">${safe(val)}</textarea></div>`;
      if(kind==='status')return `<div><label for="v8-edit-${safe(name)}">${safe(title)}</label><select name="${safe(name)}" id="v8-edit-${safe(name)}"><option value="OPEN" ${val==='OPEN'?'selected':''}>진행 중</option><option value="DONE" ${val==='DONE'?'selected':''}>완료</option></select></div>`;
      const limits=kind==='number'&&(['frequency','severity'].includes(name))?'min="1" max="3" step="1"':kind==='number'?'min="0" step="1"':'';
      return `<div><label for="v8-edit-${safe(name)}">${safe(title)}</label><input id="v8-edit-${safe(name)}" name="${safe(name)}" type="${kind==='date'?'date':kind==='number'?'number':'text'}" ${limits} value="${safe(val)}"></div>`;
    }).join('');
    const customHTML=customFields.map(f=>`<div class="wide"><label for="v8-custom-${safe(f.name)}">${safe(f.label)}</label><input type="text" id="v8-custom-${safe(f.name)}" data-custom-field="${safe(f.name)}" value="${safe(r.form_data?.[f.name]??'')}"></div>`).join('');
    const {root,close}=dialog('기록 수정',`${label[type]} #${id} · 변경 이력이 자동 저장됩니다.`,
      `<form id="v8EditForm"><div class="v8-dialog-grid">${inputHTML}${customHTML}</div><div class="v8-form-error" role="alert" id="v8EditError"></div><p class="v8-dialog-note">사진은 ‘사진 보기·첨부’에서 별도로 관리합니다. 승인된 문서의 수정은 서버에서 제한될 수 있습니다.</p></form>`,
      `<button type="button" class="cancel" data-v8-cancel>취소</button><button type="button" id="v8EditConfirm">수정 내용 저장</button>`);
    const form=root.querySelector('#v8EditForm'),save=root.querySelector('#v8EditConfirm'),error=root.querySelector('#v8EditError');
    save.addEventListener('click',async()=>{const data=new FormData(form),update={};for(const [name,,kind] of fields){const raw=String(data.get(name)??'').trim();if(kind==='number'&&raw&&(!Number.isInteger(Number(raw))||Number(raw)<(name==='frequency'||name==='severity'?1:0)||((name==='frequency'||name==='severity')&&Number(raw)>3))){error.textContent='빈도·강도는 1~3, 인원은 0 이상의 숫자로 입력하세요.';return}update[name]=raw||null}
      if(type==='risk'&&update.period_start&&update.period_end&&update.period_start>update.period_end){error.textContent='적용 시작일이 종료일보다 늦을 수 없습니다.';return}
      if(type==='custom'){const values={...(r.form_data||{})};form.querySelectorAll('[data-custom-field]').forEach(el=>{values[el.dataset.customField]=el.value});update.form_data=values}
      save.disabled=true;save.textContent='저장 중…';error.textContent='';try{await api(`/api/records/${type}/${Number(id)}`,{method:'PATCH',body:JSON.stringify(update)});close();toast('수정 완료 · 변경 이력이 저장됐습니다.');refreshRecordPage(type);if(type==='risk')loadV8RiskWeek().catch(()=>{})}catch(e){error.textContent=e.message;save.disabled=false;save.textContent='수정 내용 저장'}
    });
    form.addEventListener('submit',e=>{e.preventDefault();save.click()});
    const first=form.querySelector('input,textarea,select');if(first)first.focus();
  };

  // 모바일 메뉴 + 사용자가 현재 보고 있는 위치 인식
  function initUI(){
    const dash=document.getElementById('dashboard');
    if(dash&&!document.getElementById('v8DashboardWelcome')){
      const hero=document.createElement('div');hero.id='v8DashboardWelcome';hero.className='v8-dashboard-hero';
      hero.innerHTML='<div><span class="v8-dashboard-eyebrow">SMART SAFETY · 현장 운영 현황</span><h2>오늘의 현장 안전업무</h2><p>위험성평가 작성과 주간 결재, TBM 확인, 지적사항 조치를 한곳에서 진행하세요.</p></div><div class="v8-dashboard-shortcuts"><button type="button" data-v8-shortcut="risk">위험성평가 조회 ↗</button><button type="button" data-v8-shortcut="weekly">주간 결재 확인 ↗</button><button type="button" data-v8-shortcut="tbm">TBM 조회 ↗</button></div>';
      dash.insertBefore(hero,dash.firstChild);
      hero.querySelector('[data-v8-shortcut="risk"]').onclick=()=>v7RiskTab('lookup');
      hero.querySelector('[data-v8-shortcut="weekly"]').onclick=()=>v7WeeklyTab('approval');
      hero.querySelector('[data-v8-shortcut="tbm"]').onclick=()=>v7TbmTab('lookup');
    }
    const side=document.querySelector('.app>.side');
    if(side&&!document.getElementById('v8MobileMenu')){
      const btn=document.createElement('button');btn.id='v8MobileMenu';btn.className='v8-mobile-menu';btn.type='button';btn.textContent='☰ 메뉴';btn.setAttribute('aria-expanded','false');btn.onclick=()=>{const open=side.classList.toggle('v8-nav-open');btn.textContent=open?'× 닫기':'☰ 메뉴';btn.setAttribute('aria-expanded',String(open))};side.appendChild(btn);
      side.querySelectorAll('.nav button[data-p]').forEach(item=>item.addEventListener('click',()=>{if(window.innerWidth<=900){side.classList.remove('v8-nav-open');btn.textContent='☰ 메뉴';btn.setAttribute('aria-expanded','false')}}));
    }
    const badge=document.querySelector('.side .build-label');if(badge)badge.textContent='SAFETY WORKSPACE · V8 / 화면 개선';
    const description=document.querySelector('.top>.muted, .top>div>.muted');if(description)description.textContent='현장별 업무 · 작성부터 결재와 이력까지 한곳에서 관리';
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initUI);else initUI();
})();
