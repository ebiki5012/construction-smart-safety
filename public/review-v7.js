/* Document-first weekly risk / TBM approvals. No new API or database schema. */
(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const clean = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const day = value => String(value || '').slice(0,10);
  const siteName = () => {
    if (typeof sites === 'undefined' || typeof sid === 'undefined') return '선택 현장';
    return sites.find(s => String(s.id) === String(sid))?.name || '선택 현장';
  };
  const dateTime = value => {
    if (!value) return '-';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? clean(day(value)) : clean(d.toLocaleString('ko-KR'));
  };
  const weekName = value => {
    const str = day(value), match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
    if (!match) return '주간 위험성평가';
    return `${match[1]}년 ${Number(match[2])}월 ${Math.floor((Number(match[3])-1)/7)+1}주차`;
  };
  const weekPeriod = value => {
    const str = day(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return '-';
    const date = new Date(str + 'T12:00:00Z');
    date.setUTCDate(date.getUTCDate() + 6);
    return `${str} ~ ${date.toISOString().slice(0,10)}`;
  };
  const statusName = {PENDING:'승인 대기',APPROVED:'승인 완료',REJECTED:'반려',SUBMITTED:'승인 대기'};
  const pill = status => `<span class="review-pill ${clean(status)}">${statusName[status] || clean(status)}</span>`;
  const field = (label, value) => `<div class="review-field"><span>${clean(label)}</span><strong>${clean(value || '-')}</strong></div>`;

  const state = {site:null,weeklyMode:'approval',weeklyRows:[],selectedWeekly:null,tbmRows:[],selectedTbm:null};

  const reviewUi = {
    setWeeklyMode(mode) {
      state.weeklyMode = mode;
      const filter = byId('reviewStatusFilter');
      if (filter) { filter.value = mode === 'completed' ? 'APPROVED' : 'ALL'; filter.disabled = mode === 'completed'; }
      byId('reviewCompose')?.classList.toggle('hidden',mode === 'completed');
      if (byId('reviewSiteName')) byId('reviewSiteName').textContent = siteName();
    },
    syncSite() {
      if (state.site !== String(typeof sid === 'undefined' ? '' : sid)) {
        state.site = String(typeof sid === 'undefined' ? '' : sid);
        state.selectedWeekly = null;
        state.selectedTbm = null;
        state.weeklyRows = [];
        state.tbmRows = [];
        this.clearWeekly();
        this.clearTbm();
      }
      if (byId('reviewSiteName')) byId('reviewSiteName').textContent = siteName();
    },
    clearWeekly() {
      if (byId('v7WeeklyDetails')) byId('v7WeeklyDetails').innerHTML = '<div class="review-empty"><div class="illustration">📄</div><b>평가서를 선택해 주세요</b><p>왼쪽 목록을 누르면 평가내용과 결재 진행 상황이 표시됩니다.</p></div>';
      if (byId('v8WeeklyEvents')) byId('v8WeeklyEvents').innerHTML = '';
    },
    clearTbm() {
      if (byId('v8TbmDetail')) byId('v8TbmDetail').innerHTML = '<div class="review-empty"><div class="illustration">📝</div><b>TBM 기록을 선택해 주세요</b><p>왼쪽 목록에서 승인 대기 기록을 선택하세요.</p></div>';
    },
    getSelectedWeekly(){return state.selectedWeekly},
    renderWeeklyList(rows,mode='approval') {
      this.syncSite();
      state.weeklyMode = mode;
      state.weeklyRows = Array.isArray(rows) ? rows : [];
      for (const [key,id] of [['PENDING','reviewPending'],['APPROVED','reviewApproved'],['REJECTED','reviewRejected']]) {
        if (byId(id)) byId(id).textContent = String(state.weeklyRows.filter(r => r.status === key).length);
      }
      this.filterWeekly(true);
    },
    filterWeekly(selectFirst=false) {
      const host = byId('v7WeeklyList'); if (!host) return;
      const filter = byId('reviewStatusFilter')?.value || 'ALL';
      const rows = state.weeklyRows
        .filter(r => state.weeklyMode !== 'completed' || r.status === 'APPROVED')
        .filter(r => filter === 'ALL' || r.status === filter)
        .sort((a,b) => (a.status === 'PENDING' ? 0 : a.status === 'REJECTED' ? 1 : 2) - (b.status === 'PENDING' ? 0 : b.status === 'REJECTED' ? 1 : 2) || String(b.week_start).localeCompare(String(a.week_start)));
      host.innerHTML = rows.length ? rows.map(r => {
        const id = Number(r.id);
        return `<button type="button" class="review-document ${state.selectedWeekly === id ? 'is-selected' : ''}" data-review-id="${id}" onclick="reviewUi.selectWeekly(${id})">
          <div class="review-document-row"><span class="review-meta">위험성평가 · ${clean(weekPeriod(r.week_start))}</span>${pill(r.status)}</div>
          <strong>${clean(weekName(r.week_start))} 위험성평가</strong>
          <p>${clean(siteName())} · 위험요인 ${Number(r.item_count)||0}건 · ${Number(r.revision)||1}차</p>
          <p>상신: ${clean(r.submitted_by_name||'작성자 미확인')} ${r.approved_by_name?' · 승인: '+clean(r.approved_by_name):''}</p>
        </button>`;
      }).join('') : '<div class="review-empty"><div class="illustration">📭</div><b>해당 상태의 평가서가 없습니다</b><p>다른 상태로 조회하거나 아래에서 주차별 평가서를 취합할 수 있습니다.</p></div>';
      if (selectFirst && rows.length) {
        const selected = rows.find(r => Number(r.id) === state.selectedWeekly) || rows[0];
        this.selectWeekly(Number(selected.id));
      } else if (!rows.length) {
        this.clearWeekly();
      } else if (!rows.some(r => Number(r.id) === state.selectedWeekly)) {
        this.selectWeekly(Number(rows[0].id));
      }
    },
    selectWeekly(id) {
      state.selectedWeekly = Number(id);
      byId('v7WeeklyList')?.querySelectorAll('[data-review-id]').forEach(button => {
        button.classList.toggle('is-selected',Number(button.dataset.reviewId) === state.selectedWeekly);
      });
      if (typeof viewV7Weekly === 'function') viewV7Weekly(state.selectedWeekly);
    },
    showWeeklyDetails(r,items,events,revisions) {
      if (!r) return this.clearWeekly();
      if (state.selectedWeekly !== Number(r.id)) return;
      const id = Number(r.id), rows = Array.isArray(items) ? items : [];
      state.selectedWeekly = id;
      byId('v7WeeklyList')?.querySelectorAll('[data-review-id]').forEach(button => button.classList.toggle('is-selected',Number(button.dataset.reviewId) === id));
      const companyCount = new Set(rows.map(x => String(x.contractor_id || x.contractor_name || '')).filter(Boolean)).size;
      const track = [
        `<div class="review-approval-step done"><b>① 협력업체 작성</b><small>위험요인 ${rows.length}건</small></div>`,
        `<div class="review-approval-step done"><b>② 원청 취합·상신</b><small>${clean(r.submitted_by_name||'-')}</small></div>`,
        `<div class="review-approval-step ${r.status==='APPROVED'?'done':r.status==='PENDING'?'current':''}"><b>③ 원청 최종 승인</b><small>${r.status==='APPROVED'?clean(r.approved_by_name||'승인 완료'):r.status==='REJECTED'?'반려됨':'승인 대기 중'}</small></div>`
      ].join('');
      const approvalBtns = r.status === 'PENDING'
        ? (typeof v8IsManager === 'function' && v8IsManager()
          ? `<button class="review-btn-approve" onclick="decideV7Weekly(${id},'APPROVE')">✓ 주간 평가서 통합 승인</button><button class="review-btn-reject" onclick="decideV7Weekly(${id},'REJECT')">↩ 반려</button>`
          : '<span class="review-pill PENDING">원청 현장관리자 승인 대기</span>')
        : (r.status === 'REJECTED' && typeof v8IsManager === 'function' && v8IsManager()
          ? `<button onclick="v8ReloadRejected('${clean(day(r.week_start))}')">반려 평가서 수정·재상신 준비</button>`
          : `<span class="review-pill ${clean(r.status)}">${r.status==='APPROVED'?'결재가 완료된 평가서입니다.':'반려된 평가서입니다.'}</span>`);
      const contents = rows.length
        ? `<div class="review-data"><table><thead><tr><th>협력업체</th><th>작성자</th><th>작업</th><th>위험요인</th><th>위험도</th><th>감소대책</th><th>사진</th></tr></thead><tbody>${rows.map(x => `<tr><td>${clean(x.contractor_name||'미지정')}</td><td>${clean(x.author_name||'-')}</td><td>${clean(x.work||'-')}</td><td>${clean(x.hazard||'-')}</td><td>${Number(x.frequency)||1}×${Number(x.severity)||1}=${Number(x.score)||0}</td><td>${clean(x.measure||'-')}</td><td>${Number(x.id)>0?`<button class="review-btn-secondary" style="padding:7px" onclick="openPhotos('risk',${Number(x.id)})">📷</button>`:'-'}</td></tr>`).join('')}</tbody></table></div>`
        : '<p class="review-note">이 평가서에 포함된 위험요인이 없습니다.</p>';
      byId('v7WeeklyDetails').innerHTML = `<div class="review-detail-top"><div><div class="review-detail-kicker">주간 통합 위험성평가 · 문서 #${id} · ${Number(r.revision)||1}차</div><div class="review-detail-title">${clean(weekName(r.week_start))} 위험성평가</div><div class="muted">${clean(siteName())} · ${clean(weekPeriod(r.week_start))}</div></div>${pill(r.status)}</div>
        <div class="review-detail-content"><h4 class="review-section-heading">결재 진행 현황</h4><div class="review-approval-track">${track}</div>
        <div class="review-detail-grid">${field('현장',siteName())}${field('평가 기간',weekPeriod(r.week_start))}${field('상신자',r.submitted_by_name)}${field('참여 협력업체',`${companyCount}개 업체`)}${field('평가 위험요인',`${rows.length}건`)}${field('회의일',day(r.meeting_date))}${field('회의 참석자·업체',r.attendees||'미입력')}${field('상신 일시',dateTime(r.submitted_at))}${field('최종 승인자',r.approved_by_name||'아직 승인 전')}${field('승인 일시',dateTime(r.approved_at))}</div>
        <h4 class="review-section-heading">위험성평가 항목 (${rows.length}건)</h4>${contents}
        <h4 class="review-section-heading">회의 내용</h4><div class="review-note">${clean(r.meeting_notes||'작성된 회의 내용이 없습니다.')}</div>
        ${r.status==='REJECTED'?`<h4 class="review-section-heading" style="color:#b2383d">반려 사유</h4><div class="review-note">${clean(r.decision_comment||'-')}</div>`:''}
        <div class="review-actions">${approvalBtns}<button class="review-btn-secondary" onclick="window.open('/api/v8/weekly/${id}/report','_blank')">🖨 평가서 인쇄 / PDF</button></div></div>`;
      const history = (Array.isArray(events)?events:[]).map(e => `<div class="review-history-event">${dateTime(e.created_at)} · ${clean(e.actor_name||'-')} · ${clean(({SUBMIT:'상신',APPROVE:'승인',REJECT:'반려'})[e.action] || e.action)}${e.comment?' · '+clean(e.comment):''}</div>`).join('');
      const versions = (Array.isArray(revisions)?revisions:[]).map(v => `<button class="review-btn-secondary" style="padding:6px 10px;font-size:12px;margin:2px" onclick="window.open('/api/v8/weekly/${id}/report?revision=${Number(v.revision)}','_blank')">${Number(v.revision)}차 (${Number(v.item_count)}건)</button>`).join('');
      if (byId('v8WeeklyEvents')) byId('v8WeeklyEvents').innerHTML = `<div class="review-history"><h4 class="review-section-heading">상신 · 승인 · 반려 이력</h4>${history||'<span class="muted">등록된 이력이 없습니다.</span>'}${versions?'<h4 class="review-section-heading">평가서 차수 보관</h4>'+versions:''}</div>`;
    },
    renderTbmList(rows) {
      this.syncSite();
      state.tbmRows = Array.isArray(rows) ? rows : [];
      const host=byId('v8TbmApprovals'); if(!host)return;
      host.innerHTML = state.tbmRows.length ? state.tbmRows.map(r=>`<button type="button" class="review-document ${Number(r.id)===state.selectedTbm?'is-selected':''}" data-tbm-review="${Number(r.id)}" onclick="reviewUi.selectTbm(${Number(r.id)})"><div class="review-document-row"><span class="review-meta">${clean(day(r.tbm_date))} · ${clean(r.contractor_name||'업체 미지정')}</span>${pill('SUBMITTED')}</div><strong>${clean(r.work_name||'작업명 미입력')}</strong><p>${clean(r.team||'-')} · 작성자 ${clean(r.author_name||'-')} · ${Number(r.people)||0}명</p></button>`).join('') : '<div class="review-empty"><div class="illustration">✅</div><b>승인 대기 TBM이 없습니다</b><p>현재 선택한 현장의 결재 대기가 없습니다.</p></div>';
      if (state.tbmRows.length) this.selectTbm(state.tbmRows.some(r=>Number(r.id)===state.selectedTbm)?state.selectedTbm:Number(state.tbmRows[0].id));
      else this.clearTbm();
    },
    selectTbm(id) {
      state.selectedTbm = Number(id);
      const r=state.tbmRows.find(x=>Number(x.id)===state.selectedTbm);if(!r)return;
      byId('v8TbmApprovals')?.querySelectorAll('[data-tbm-review]').forEach(b=>b.classList.toggle('is-selected',Number(b.dataset.tbmReview)===state.selectedTbm));
      const isManager=typeof v8IsManager==='function' && v8IsManager();
      byId('v8TbmDetail').innerHTML=`<div class="review-detail-top"><div><div class="review-detail-kicker">TBM 기록 · #${Number(r.id)}</div><div class="review-detail-title">${clean(r.work_name||'TBM 작업')}</div><div class="muted">${clean(siteName())} · ${clean(day(r.tbm_date))}</div></div>${pill('SUBMITTED')}</div>
        <div class="review-detail-content"><div class="review-detail-grid">${field('협력업체',r.contractor_name||'미지정')}${field('작성자',r.author_name||'-')}${field('실시일',day(r.tbm_date))}${field('참여 인원',`${Number(r.people)||0}명`)}${field('팀/업체',r.team||'-')}${field('결재 상태','원청 승인 대기')}</div>
        <h4 class="review-section-heading">주요 위험요인</h4><div class="review-note">${clean(r.hazard||'입력된 위험요인이 없습니다.')}</div>
        <h4 class="review-section-heading">안전대책</h4><div class="review-note">${clean(r.measure||'입력된 안전대책이 없습니다.')}</div>
        <div class="review-actions"><button class="review-btn-secondary" onclick="openPhotos('tbm',${Number(r.id)})">📷 사진 보기</button>${isManager?`<button class="review-btn-approve" onclick="v8DecideTbm(${Number(r.id)},'APPROVED')">✓ TBM 승인</button><button class="review-btn-reject" onclick="v8DecideTbm(${Number(r.id)},'REJECTED')">↩ 반려</button>`:'<span class="review-pill PENDING">원청 승인 대기</span>'}</div></div>`;
    }
  };
  window.reviewUi = reviewUi;
})();
