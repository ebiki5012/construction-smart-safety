/* One common taxonomy for writing, library and existing-record reuse. */
(()=>{'use strict';
const C=window.V22Catalog,cat=document.getElementById('riskCategory');if(!C||!cat)return;
for(const g of C.groups){const o=document.createElement('option');o.value=g.id;o.textContent=g.name;cat.append(o);}
const launch=document.querySelector('.v15-template-launch');
launch?.addEventListener('click',()=>{window.v23FilterFromDraft=true;},{capture:true});
cat.addEventListener('change',()=>{cat.removeAttribute('aria-invalid');});
const write=document.getElementById('v7_risk_write'),save=write?.querySelector('button[onclick="saveRisk()"]');
if(save){const result=document.createElement('div');result.className='v23-saved-risk hidden';result.setAttribute('role','status');const text=document.createElement('span'),button=document.createElement('button');button.type='button';button.textContent='표준평가로 저장';result.append(text,button);save.after(result);let last=null;
window.v23ShowSavedRisk=(row,site,user)=>{if(String(sid)!==site||String(me?.id||'')!==user||!Number.isSafeInteger(Number(row.id)))return;last={id:Number(row.id),site,user};text.textContent=(C.categoryName(row.category||cat.value)||'선택 공종')+' · 위험성평가 저장 완료';result.classList.remove('hidden');};
button.onclick=()=>{if(!last||last.site!==String(sid)||last.user!==String(me?.id||'')){result.classList.add('hidden');return;}window.toTpl(last.id);};
new MutationObserver(()=>{if(last&&(last.site!==String(sid)||last.user!==String(me?.id||'')))result.classList.add('hidden');}).observe(document.getElementById('who'),{childList:true});
for(const id of ['riskCategory','ra','rw','rh','rm','rf','rs','riskContractor'])document.getElementById(id)?.addEventListener('input',()=>result.classList.add('hidden'));
}

const version=document.getElementById('releaseVersion');if(version)version.textContent='V23 · 공종 선택 · 결재 진행 현황';
})();
