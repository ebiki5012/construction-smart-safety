// Delegated account endpoint tests: fake SQL, no production data or password storage.
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const src=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8'),html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8'),ui=fs.readFileSync(new URL('../public/site-admin-v17.js',import.meta.url),'utf8');
new vm.Script(ui);assert(html.includes('site-admin-v17.js'));assert(html.includes('v17CanSubmit'));assert(html.includes('window.v17LoadAccounts'));
const handlers={},app={get:(p,a,f)=>handlers['GET '+p]=f,post:(p,a,f)=>handlers['POST '+p]=f,patch:(p,a,f)=>handlers['PATCH '+p]=f};
let role='MANAGER',target={id:22,name:'담당자',username:'worker22',global_role:'USER',role:'USER',site_count:1,active:true,archived_at:null,contractor_id:5},pending=false,conflict=false,mutations=[],audit=[];
const query=async(sql,args=[])=>{const s=sql.trim();if(['BEGIN','COMMIT','ROLLBACK'].includes(s)||s.startsWith('SELECT pg_advisory_xact_lock'))return {rows:[]};
 if(s.startsWith('SELECT id FROM contractors'))return {rows:args[0]===5&&args[1]===1?[{id:5}]:[]};
 if(s.startsWith('SELECT id FROM users WHERE'))return {rows:conflict?[{id:99}]:[]};
 if(s.startsWith('SELECT u.id,u.name,u.username,u.role global_role'))return {rows:args[0]===target.id&&args[1]===1?[{...target}]:[]};
 if(s.startsWith('SELECT w.id FROM weekly_risk_reviews'))return {rows:pending?[{id:3}]:[]};
 if(s.startsWith('INSERT INTO users')){mutations.push({s,args});return {rows:[{id:23,name:args[0],username:args[2]}]}};
 if(s.startsWith('INSERT INTO admin_events')){audit.push({action:args[1],details:JSON.parse(args[3])});return {rows:[]}};
 if(/^(INSERT INTO (memberships|contractor_memberships)|UPDATE (users|memberships)|DELETE FROM contractor_memberships)/.test(s)){mutations.push({s,args});return {rows:[]}};
 throw Error('Missing fake SQL '+s.slice(0,110));};
const ctx=vm.createContext({app,auth:()=>{},can:async(req,sid,roles)=>sid===1&&roles.includes(role),q:async()=>[{...target}],pool:{connect:async()=>({query,release(){}})},cleanUsername:v=>String(v||'').trim().toLowerCase(),validUsername:v=>/^[a-z][a-z0-9._-]{3,29}$/.test(v),validPassword:v=>typeof v==='string'&&v.length>=10&&v.length<=128,bcrypt:{hash:async()=> 'FAKE_HASH'},crypto:{randomUUID:()=> 'fake-uuid'},console});
vm.runInContext(src.slice(src.indexOf('// V17: delegated account administration.'),src.indexOf('// 관리자가 사이트 안에서 직접 양식/메뉴를 구성합니다.')),ctx);
async function call(method,body={},id=22,actor=10){let status=200,data,error;const res={status(n){status=n;return this},json(x){data=x;return this}};await handlers[method+' /api/v17/site-accounts'+(method==='PATCH'?'/:id':'')]({query:body,body,params:{id},session:{userId:actor}},res,e=>error=e);if(error)throw error;return {status,data}}
const base={site_id:1,name:'신규 담당자',username:'newuser',password:'test-password',role:'CONTRACTOR_MANAGER',contractor_id:5};
let r=await call('POST',{...base,site_id:2});assert.equal(r.status,403);role='SAFETY_MANAGER';r=await call('POST',base);assert.equal(r.status,403);role='MANAGER';
for(const forbidden of ['ADMIN','MANAGER']){r=await call('POST',{...base,role:forbidden,contractor_id:null});assert.equal(r.status,400)}
r=await call('POST',{...base,contractor_id:9});assert.equal(r.status,400);r=await call('POST',{...base,contractor_id:null});assert.equal(r.status,400);assert.equal(mutations.length,0);
conflict=true;r=await call('POST',base);assert.equal(r.status,409);conflict=false;
r=await call('POST',base);assert.equal(r.status,201);assert(mutations.some(m=>m.s.includes("'USER') RETURNING")));assert(mutations.some(m=>m.s.startsWith('INSERT INTO contractor_memberships')&&m.args[2]===5));assert.equal(audit[0].action,'CREATE');assert(!JSON.stringify(audit).includes(base.password));
r=await call('GET',{site_id:1});assert.equal(r.data[0].editable,true);target.site_count=2;r=await call('GET',{site_id:1});assert.equal(r.data[0].editable,false);r=await call('PATCH',{site_id:1,action:'RESET',password:base.password});assert.equal(r.status,403);
target.site_count=1;target.global_role='ADMIN';r=await call('PATCH',{site_id:1,action:'DISABLE'});assert.equal(r.status,403);target.global_role='USER';target.role='MANAGER';r=await call('PATCH',{site_id:1,action:'DISABLE'});assert.equal(r.status,403);target.role='USER';
r=await call('PATCH',{site_id:1,action:'DISABLE'},22,22);assert.equal(r.status,403);r=await call('PATCH',{site_id:1,action:'DISABLE'},999);assert.equal(r.status,403);
r=await call('PATCH',{...base,action:'EDIT',role:'ADMIN'});assert.equal(r.status,400);r=await call('PATCH',{...base,action:'EDIT',role:'USER',contractor_id:9});assert.equal(r.status,400);
pending=true;r=await call('PATCH',{site_id:1,action:'ARCHIVE',reason:'퇴사로 계정 보관'});assert.equal(r.status,409);r=await call('PATCH',{site_id:1,action:'DISABLE'});assert.equal(r.status,409);pending=false;
r=await call('PATCH',{...base,action:'EDIT',role:'SAFETY_MANAGER',contractor_id:null});assert.equal(r.status,200);assert(mutations.some(m=>m.s.startsWith('UPDATE memberships')&&m.args[0]==='SAFETY_MANAGER'));
r=await call('PATCH',{site_id:1,action:'RESET',password:base.password});assert.equal(r.status,200);assert(mutations.some(m=>m.s.includes('password_hash=$1')&&m.args[0]==='FAKE_HASH'));
r=await call('PATCH',{site_id:1,action:'ARCHIVE',reason:'퇴사로 계정 보관'});assert.equal(r.status,200);assert(mutations.some(m=>m.s.includes('archived_at=now()')));target.archived_at='2026-11-24';r=await call('PATCH',{site_id:1,action:'ENABLE'});assert.equal(r.status,409);r=await call('PATCH',{site_id:1,action:'RESTORE'});assert.equal(r.status,200);assert(mutations.some(m=>m.s.includes('archived_at=NULL')&&m.s.includes('active=false')));assert(!JSON.stringify(audit).includes(base.password));
console.log('PASS V17: site isolation, role escalation blocked, atomic user/company creation, shared-account protection, password reset, pending approval guard, archive/restore and audit');
