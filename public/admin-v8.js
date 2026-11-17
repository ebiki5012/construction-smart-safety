/* V8 관리자 센터: 기록 복원도 실제 사유 입력창을 사용한다. */
(() => {
  'use strict';
  const allowed=new Set(['risk','tbm','action','custom']);
  let busy=false;
  window.restore=async function restore(type,id){
    if(!allowed.has(type)||!Number.isSafeInteger(Number(id))||Number(id)<1)return;
    const modal=document.createElement('div');
    modal.className='v8-admin-overlay';
    modal.innerHTML=`<div class="v8-admin-dialog" role="dialog" aria-modal="true" aria-labelledby="v8AdminRestoreTitle"><div class="v8-admin-dialog-head"><div><h2 id="v8AdminRestoreTitle">기록 복원</h2><p>${type.toUpperCase()} #${Number(id)} · 최고관리자 전용</p></div><button type="button" class="secondary" data-close>닫기</button></div><p>휴지통에서 원본 기록을 복원합니다. 복원 사유와 처리 이력은 남습니다.</p><label for="v8AdminRestoreReason">복원 사유 (필수 · 5~500자)</label><textarea id="v8AdminRestoreReason" maxlength="500" placeholder="예: 테스트 기록이 아니라 실제 업무 기록으로 확인되어 복원"></textarea><p class="v8-admin-error" id="v8AdminRestoreError" role="alert"></p><div class="v8-admin-actions"><button class="secondary" type="button" data-close>취소</button><button type="button" id="v8AdminRestoreRun" disabled>사유 기록 후 복원</button></div></div>`;
    document.body.appendChild(modal);
    const close=()=>{modal.remove();document.removeEventListener('keydown',esc)};
    const esc=e=>{if(e.key==='Escape')close()};document.addEventListener('keydown',esc);
    modal.querySelectorAll('[data-close]').forEach(x=>x.addEventListener('click',close));
    modal.addEventListener('click',e=>{if(e.target===modal)close()});
    const reason=modal.querySelector('#v8AdminRestoreReason'),button=modal.querySelector('#v8AdminRestoreRun'),error=modal.querySelector('#v8AdminRestoreError');
    reason.focus();reason.addEventListener('input',()=>{const n=reason.value.trim().length;button.disabled=n<5||n>500;error.textContent=n&&n<5?'복원 사유를 5자 이상 적어 주세요.':''});
    button.addEventListener('click',async()=>{if(busy)return;const value=reason.value.trim();if(value.length<5||value.length>500)return;busy=true;button.disabled=true;button.textContent='복원 중…';try{await api(`/api/admin/trash/${type}/${Number(id)}/restore`,'POST',{reason:value});close();await loadCleanupCenter();msg('기록 복원 완료 · 처리 이력은 보존됩니다.')}catch(e){error.textContent=e.message;button.disabled=false;button.textContent='사유 기록 후 복원'}finally{busy=false}});
  };
})();
