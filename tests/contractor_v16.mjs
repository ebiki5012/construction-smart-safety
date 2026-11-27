// Offline contract tests for V16 first-stage contractor approval.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const server=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
const cut=(a,b)=>{const x=server.indexOf(a),y=server.indexOf(b,x+a.length);assert(x>=0&&y>x,a);return server.slice(x,y)};
const handlers={},app={post:(path,auth,fn)=>handlers[path]=fn};
let managers=[{id:12,name:'협력사 관리자'}];let role='CONTRACTOR_MANAGER',scope={allowed:true,restricted:true,contractor_id:5},hash='same',locked=false;
let submission={site_id:1,week_start:'2026-11-23',contractor_id:5,status:'SUBMITTED',risk_hash:'same',submitted_by:9};
const events=[];
const query=async(sql,args=[])=>{
 const c=sql.trim();
 if(['BEGIN','COMMIT','ROLLBACK'].includes(c)||c.startsWith('SELECT pg_advisory_xact_lock'))return {rows:[]};
 if(c.startsWith('SELECT * FROM weekly_contractor_submissions'))return {rows:submission?[structuredClone(submission)]:[]};
 if(c.startsWith('UPDATE weekly_contractor_submissions SET status')){submission={...submission,status:args[3],approved_by:args[4],decision_comment:args[5]};return {rows:[structuredClone(submission)]}}
 if(c.startsWith('INSERT INTO weekly_contractor_approval_events')){events.push({action:args[3],actor:args[4]});return {rows:[]}}
 if(c.startsWith('SELECT id FROM contractors WHERE'))return {rows:[{id:5}]};
 if(c.startsWith('INSERT INTO weekly_contractor_submissions')){submission={...submission,status:'SUBMITTED',risk_hash:args[4],submitted_by:args[3],approved_by:null};return {rows:[structuredClone(submission)]}}
 throw new Error('missing fake SQL '+c.slice(0,100));
};
const pool={connect:async()=>({query,release(){}})};
const ctx=vm.createContext({app,auth:()=>{},pool,companyScope:async()=>scope,siteRole:async()=>role,
 companyManagers:async()=>managers,companyIsLocked:async()=>locked,companyRiskFingerprint:async()=>({count:1,hash}),
 validMonday:s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&new Date(s+'T00:00:00Z').getUTCDay()===1,
 console,Number,String,Date});
vm.runInContext(cut("app.post('/api/v8/weekly/ready'","// Readable approver settings"),ctx);
vm.runInContext(cut("app.post('/api/v16/contractor/decision'","app.get('/api/v16/contractor-events'"),ctx);
async function call(path,body,actor=12){let status=200,data,error;const res={status(n){status=n;return this},json(x){data=x;return this}};await handlers[path]({body,session:{userId:actor}},res,e=>error=e);if(error)throw error;return {status,data}}
const approve='/api/v16/contractor/decision',ready='/api/v8/weekly/ready';
const base={site_id:1,week_start:'2026-11-23',contractor_id:5};
let r=await call(approve,{...base,action:'APPROVE'});assert.equal(r.status,200);assert.equal(submission.status,'APPROVED');assert.equal(submission.approved_by,12);
r=await call(approve,{...base,action:'APPROVE'});assert.equal(r.status,409,'duplicate first approval blocked');
role='USER';r=await call(approve,{...base,action:'APPROVE'});assert.equal(r.status,403,'ordinary contractor staff cannot approve');
role='CONTRACTOR_MANAGER';scope.contractor_id=6;r=await call(approve,{...base,action:'APPROVE'});assert.equal(r.status,403,'other company manager cannot approve');scope.contractor_id=5;
r=await call(ready,base,9);assert.equal(r.status,409,'unchanged approved record cannot be reset');hash='updated';managers=[];r=await call(ready,base,9);assert.equal(r.status,409,'missing company manager blocks new submission');managers=[{id:12,name:'협력사 관리자'}];r=await call(ready,base,9);assert.equal(r.status,200);assert.equal(submission.status,'SUBMITTED');assert.equal(submission.approved_by,null,'resubmission clears prior approval');
hash='changed';r=await call(approve,{...base,action:'APPROVE'});assert.equal(r.status,409,'modified risk cannot be approved without resubmission');
hash='updated';r=await call(approve,{...base,action:'REJECT'});assert.equal(r.status,400,'reject requires reason');
r=await call(approve,{...base,action:'REJECT',comment:'안전대책 보완'});assert.equal(r.status,200);assert.equal(submission.status,'REJECTED');
locked=true;r=await call(ready,base,9);assert.equal(r.status,409,'cannot resubmit after integrated submission');
assert.equal(events.length,3,'first approval, resubmission and rejection must all be audited');
console.log('PASS V16 contractor: own-company approval, changed risk rejection, no duplicate, resubmission resets, locked week, audit events');
