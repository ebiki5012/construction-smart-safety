import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const src=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
const handlers={},app={get:(p,a,f)=>handlers['GET']=f,put:(p,a,f)=>handlers['PUT']=f};
let actorRole='MANAGER',pending=false,settings=null,events=[];
const members=[{id:10,site:1,role:'SAFETY_MANAGER',active:true},{id:20,site:1,role:'SITE_DIRECTOR',active:true},{id:30,site:1,role:'MANAGER',active:true},{id:40,site:2,role:'SITE_DIRECTOR',active:true},{id:50,site:1,role:'SITE_DIRECTOR',active:false}];
const query=async(sql,args=[])=>{const s=sql.trim();if(['BEGIN','COMMIT','ROLLBACK'].includes(s)||s.startsWith('SELECT pg_advisory_xact_lock'))return {rows:[]};
 if(s.startsWith('SELECT u.id FROM users'))return {rows:members.filter(m=>m.id===args[0]&&m.site===args[1]&&m.role===args[2]&&m.active)};
 if(s.startsWith('SELECT id FROM weekly_risk_reviews'))return {rows:pending?[{id:1}]:[]};
 if(s.startsWith('INSERT INTO weekly_approval_settings')){settings={site_id:args[0],safety_user_id:args[1],director_user_id:args[2],allow_self_review:args[4],review_role:args[5]};return {rows:[settings]}};
 if(s.startsWith('INSERT INTO admin_events')){events.push(JSON.parse(args[2]));return {rows:[]}};
 throw Error('Missing fake SQL '+s.slice(0,100));};
const ctx=vm.createContext({app,auth:()=>{},can:async(req,sid,roles=[])=>sid===1&&(!roles.length||roles.includes(actorRole)||actorRole==='ADMIN'),siteRole:async()=>actorRole,approverConfig:async()=>settings,q:async()=>members.filter(m=>m.site===1&&m.active),pool:{connect:async()=>({query,release(){}})},console});
vm.runInContext(src.slice(src.indexOf('async function validStageUser('),src.indexOf('async function companyIsLocked(')),ctx);
vm.runInContext(src.slice(src.indexOf("app.get('/api/v16/approvers'"),src.indexOf("app.get('/api/v16/contractor-approvals'")),ctx);
async function call(method,body){let status=200,data,error;const res={status(n){status=n;return this},json(x){data=x;return this}};await handlers[method]({body,query:body,session:{userId:30}},res,e=>error=e);if(error)throw error;return {status,data}}
const base={site_id:1,review_role:'NONE',director_user_id:20};
for(const role of ['USER','CONTRACTOR_MANAGER','SAFETY_MANAGER','SITE_DIRECTOR']){actorRole=role;assert.equal((await call('PUT',base)).status,403);assert.equal((await call('GET',base)).data.can_configure,false)}
actorRole='MANAGER';assert.equal((await call('PUT',{...base,site_id:2})).status,403);
for(const id of [0,10,40,50])assert.equal((await call('PUT',{...base,director_user_id:id})).status,400);
assert.equal((await call('PUT',{...base,review_role:'ANY'})).status,400);
assert.equal((await call('PUT',{...base,review_role:'SAFETY_MANAGER'})).status,400);
assert.equal((await call('PUT',{...base,review_role:'MANAGER',safety_user_id:10})).status,400);
assert.equal((await call('PUT',{...base,review_role:'MANAGER',safety_user_id:30})).status,200);assert.equal(settings.review_role,'MANAGER');assert.equal(settings.safety_user_id,30);
pending=true;assert.equal((await call('PUT',base)).status,409);assert.equal(settings.review_role,'MANAGER');pending=false;
assert.equal((await call('PUT',{...base,safety_user_id:10})).status,200);assert.equal(settings.safety_user_id,null);assert.equal(settings.review_role,'NONE');assert.equal(events.at(-1).review_role,'NONE');
assert.equal((await call('GET',base)).data.can_configure,true);assert.equal((await call('GET',base)).data.review_role,'NONE');
assert.equal((await call('PUT',{...base,review_role:'SAFETY_MANAGER',safety_user_id:10})).status,200);assert.equal(settings.safety_user_id,10);
console.log('PASS V18: site-manager-only route edits, cross-site and inactive approvers blocked, pending guard, all three route modes, audit');
