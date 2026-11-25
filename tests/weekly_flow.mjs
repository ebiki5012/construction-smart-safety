// V16 offline state-machine regression. Fake SQL responses, NOT a live PostgreSQL test.
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
const extract=(a,b)=>{const i=source.indexOf(a),j=source.indexOf(b,i+a.length);assert(i>=0&&j>i,a);return source.slice(i,j)};
const handlers={},app={post:(path,auth,fn)=>handlers[path]=fn};
const riskRows=[{id:11,author_id:77,area:'1층',work:'철근',hazard:'추락',measure:'난간',frequency:2,severity:3,score:6,level:'높음',contractor_id:5,contractor_name:'A건설',author_name:'홍길동',risk_date:'2026-11-09',period_start:'2026-11-09',period_end:'2026-11-15'}];
let allowSelf=true,actorRole="MANAGER",reviewRole="SAFETY_MANAGER";
let weekly=null,events=[],revisions=[],stageEvents=[],fingerprint='hash-v1',companyApproved=true;
const query=async(sql,args=[])=>{
 const c=sql.trim();
 if(['BEGIN','COMMIT','ROLLBACK'].includes(c)||c.startsWith('SELECT pg_advisory_xact_lock'))return {rows:[]};
 if(c.startsWith('SELECT * FROM weekly_risk_reviews WHERE site_id'))return {rows:weekly?[structuredClone(weekly)]:[]};
 if(c.startsWith('SELECT r.id,r.area,r.work,r.hazard'))return {rows:structuredClone(riskRows)};
 if(c.startsWith('SELECT DISTINCT r.contractor_id'))return {rows:[{contractor_id:5,name:'A건설',status:companyApproved?'APPROVED':'SUBMITTED',risk_hash:'hash-v1'}]};
 if(c.startsWith('SELECT ws.approved_by,ws.approved_at'))return {rows:[{approved_by:5,approved_at:'2026-11-09T08:00:00Z',status:'APPROVED',approved_by_name:'협력사 소장'}]};
 if(c.startsWith('INSERT INTO weekly_risk_reviews')){weekly={id:1,site_id:1,week_start:args[1],status:'PENDING',approval_stage:args[8],revision:1,snapshot:JSON.parse(args[6]),snapshot_hash:args[7],meeting_notes:args[2]};return {rows:[structuredClone(weekly)]}}
 if(c.startsWith("UPDATE weekly_risk_reviews SET status='PENDING'")){weekly={...weekly,status:'PENDING',approval_stage:args[8],revision:args[1],snapshot:JSON.parse(args[2]),snapshot_hash:args[3],safety_approved_at:null,safety_approved_by:null};return {rows:[structuredClone(weekly)]}}
 if(c.startsWith('SELECT * FROM weekly_risk_reviews WHERE id=$1 FOR UPDATE'))return {rows:weekly?[structuredClone(weekly)]:[]};
 if(c.startsWith("UPDATE weekly_risk_reviews SET approval_stage='DIRECTOR'")){weekly={...weekly,approval_stage:'DIRECTOR',safety_approved_by:args[1],safety_approved_at:'2026-11-09T10:00:00Z',safety_comment:args[2]};return {rows:[structuredClone(weekly)]}}
 if(c.startsWith("UPDATE weekly_risk_reviews SET status='APPROVED'")){weekly={...weekly,status:'APPROVED',approval_stage:'COMPLETE',approved_by:args[1],approved_at:'2026-11-09T11:00:00Z'};return {rows:[structuredClone(weekly)]}}
 if(c.startsWith("UPDATE weekly_risk_reviews SET status='REJECTED'")){weekly={...weekly,status:'REJECTED',decision_comment:args[1]};return {rows:[structuredClone(weekly)]}}
 if(c.startsWith('UPDATE weekly_risk_revisions SET approved_by'))return {rows:[]};
 if(c.startsWith('SELECT safety_user_id,director_user_id,allow_self_review,review_role FROM weekly_risk_revisions'))return {rows:revisions.filter(r=>r.revision===args[1])};
 if(c.startsWith('INSERT INTO weekly_risk_revisions')){revisions.push({revision:args[1],snapshot:JSON.parse(args[2]),company_approvals:JSON.parse(args[8]),safety_user_id:args[9],director_user_id:args[10],allow_self_review:args[11],review_role:args[12]});return {rows:[]}}
 if(c.startsWith('INSERT INTO weekly_risk_events')){events.push({revision:args[1],action:args[2]});return {rows:[]}}
 if(c.startsWith('INSERT INTO weekly_stage_approval_events')){stageEvents.push({revision:args[1],stage:args[2],action:args[3],actor_id:args[4]});return {rows:[]}}
 if(c.startsWith('INSERT INTO weekly_risk_items')||c.startsWith('DELETE FROM weekly_risk_items'))return {rows:[]};
 throw new Error('Missing fake SQL '+c.slice(0,110));
};
const pool={connect:async()=>({query,release(){}})};
const context=vm.createContext({app,auth:()=>{},can:async(req,sid,roles=[])=>!roles.length||roles.includes(actorRole),pool,
 approverConfig:async()=>({safety_user_id:reviewRole==='NONE'?null:reviewRole==='MANAGER'?30:10,director_user_id:20,allow_self_review:allowSelf,review_role:reviewRole}),validStageUser:async(client,sid,uid,stage,rr)=>Number(uid)===(stage==='SAFETY'?(rr==='MANAGER'?30:10):20),
 companyRiskFingerprint:async()=>({count:1,hash:fingerprint}),weeklyRowsSql:'SELECT r.id,r.area,r.work,r.hazard',
 validMonday:s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&new Date(s+'T00:00:00Z').getUTCDay()===1,
 isoDate:x=>String(x||'').slice(0,10),crypto,console,JSON,Number,String,Date});
vm.runInContext(extract("app.post('/api/v7/weekly'","app.get('/api/v7/weekly/:id/items'"),context);
vm.runInContext(extract("app.post('/api/v7/weekly/:id/decision'","app.get('/api/v8/weekly/:id/report'"),context);
async function call(path,body,actor=99){let status=200,data,error;const res={status(n){status=n;return this},json(x){data=x;return this}};await handlers[path]({body,params:{id:1},session:{userId:actor}},res,e=>error=e);if(error)throw error;return {status,data}}
const submit='/api/v7/weekly',decide='/api/v7/weekly/:id/decision';
let r=await call(submit,{site_id:1,week_start:'2026-11-09',meeting_notes:'안전회의'});
assert.equal(r.status,200);assert.equal(weekly.approval_stage,'SAFETY');assert.equal(revisions[0].company_approvals[0].approved_by_name,'협력사 소장');
r=await call(decide,{action:'APPROVE'},20);assert.equal(r.status,403,'director cannot skip safety');
r=await call(decide,{action:'APPROVE'},99);assert.equal(r.status,403,'admin cannot impersonate assigned approver');
r=await call(decide,{action:'APPROVE',comment:'위험요인 검토 완료'},10);assert.equal(r.status,200);assert.equal(weekly.status,'PENDING');assert.equal(weekly.approval_stage,'DIRECTOR');
r=await call(decide,{action:'APPROVE'},10);assert.equal(r.status,403,'safety cannot approve director stage');
r=await call(decide,{action:'APPROVE'},20);assert.equal(r.status,200);assert.equal(weekly.status,'APPROVED');assert.equal(weekly.approval_stage,'COMPLETE');assert.equal(weekly.approved_by,20);
r=await call(decide,{action:'APPROVE'},20);assert.equal(r.status,409,'duplicate final approval blocked');
assert.deepEqual(stageEvents.map(e=>e.stage),['SAFETY','DIRECTOR']);
weekly.status='REJECTED';riskRows[0].hazard='수정 위험요인';fingerprint='hash-v2';
r=await call(submit,{site_id:1,week_start:'2026-11-09'});assert.equal(r.status,409,'changed risk after contractor approval blocks submission');
fingerprint='hash-v1';companyApproved=false;
r=await call(submit,{site_id:1,week_start:'2026-11-09'});assert.equal(r.status,409,'unapproved contractor blocks submission');
companyApproved=true;r=await call(submit,{site_id:1,week_start:'2026-11-09'});assert.equal(r.status,200);assert.equal(weekly.revision,2);assert.equal(weekly.approval_stage,'SAFETY');assert.equal(revisions.length,2);assert.equal(revisions[0].snapshot[0].hazard,'추락');
weekly.status='REJECTED';actorRole='SAFETY_MANAGER';allowSelf=false;
r=await call(submit,{site_id:1,week_start:'2026-11-09'},10);assert.equal(r.status,409,'self-submission blocked if self-review disabled');
riskRows[0].author_id=10;actorRole='MANAGER';r=await call(submit,{site_id:1,week_start:'2026-11-09'},99);assert.equal(r.status,409,'self-authored item blocked if self-review disabled');
riskRows[0].author_id=77;actorRole='SAFETY_MANAGER';allowSelf=true;r=await call(submit,{site_id:1,week_start:'2026-11-09'},10);assert.equal(r.status,200,'safety manager can submit');
actorRole='USER';weekly.status='REJECTED';r=await call(submit,{site_id:1,week_start:'2026-11-09'},77);assert.equal(r.status,403,'contractor cannot submit integrated document');
actorRole='MANAGER';weekly.status='PENDING';weekly.approval_stage='LEGACY';r=await call(decide,{action:'APPROVE'},99);assert.equal(r.status,409,'legacy pending cannot fabricate 3-stage approval');
console.log('PASS weekly V16: company approval gate, role-separated stages, no skip/duplicate, immutable revisions, legacy guard');

// V18: explicit route snapshot, never infer skip from a missing safety user.
weekly=null;reviewRole='NONE';actorRole='MANAGER';companyApproved=false;
r=await call(submit,{site_id:1,week_start:'2026-11-09'});assert.equal(r.status,409,'2-stage still requires contractor approval');
companyApproved=true;r=await call(submit,{site_id:1,week_start:'2026-11-09'});assert.equal(r.status,200);assert.equal(weekly.approval_stage,'DIRECTOR');assert.equal(revisions.at(-1).review_role,'NONE');assert.equal(revisions.at(-1).safety_user_id,null);
// fake DB uses the same id for each test; isolate revisions from prior scenarios.
revisions=[revisions.at(-1)];reviewRole='SAFETY_MANAGER';
r=await call(decide,{action:'APPROVE'},10);assert.equal(r.status,403);
r=await call(decide,{action:'APPROVE'},20);assert.equal(r.status,200);assert.equal(weekly.status,'APPROVED');assert.equal(weekly.safety_approved_at,undefined);
weekly=null;revisions=[];reviewRole='MANAGER';
r=await call(submit,{site_id:1,week_start:'2026-11-09'});assert.equal(r.status,200);assert.equal(weekly.approval_stage,'SAFETY');assert.equal(revisions[0].review_role,'MANAGER');
reviewRole='NONE';r=await call(decide,{action:'APPROVE'},20);assert.equal(r.status,403,'cannot skip frozen manager review');
r=await call(decide,{action:'APPROVE'},10);assert.equal(r.status,403,'safety manager cannot impersonate assigned site manager');
r=await call(decide,{action:'APPROVE'},30);assert.equal(r.status,200);assert.equal(weekly.approval_stage,'DIRECTOR');
r=await call(decide,{action:'APPROVE'},20);assert.equal(r.status,200);assert.equal(weekly.status,'APPROVED');
console.log('PASS V18: explicit two-stage route, manager review, immutable route snapshot and contractor approval gate');
