// Offline regression for reversible V7.2 superadmin clean-up (no live DB writes).
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
const first=source.indexOf('function v10Reason(body)');
const last=source.indexOf("app.put('/api/admin/approvals/:type/:id'",first);
assert(first>0&&last>first,'V7.2 management endpoints must exist');

const handlers={};
const app={post:(path,_auth,handler)=>{handlers[path]=handler}};
let manager=false,queries=0;
let weekly={id:91,site_id:7,week_start:'2026-11-16',status:'APPROVED',revision:2,approved_by:4,approved_at:'2026-11-20T09:00:00Z'};
let revision={weekly_id:91,revision:2,approved_by:4,approved_at:'2026-11-20T09:00:00Z'};
let direct={id:5,record_type:'tbm',record_id:42,status:'APPROVED'};
let legacy={id:6,record_type:'risk',record_id:50,status:'APPROVED',site_id:7,current_step:2};
const events=[],audits=[],decisions=[];
const run=async(sql,values=[])=>{
  queries++;
  const s=sql.replace(/\s+/g,' ').trim();
  if(['BEGIN','COMMIT','ROLLBACK'].includes(s))return {rows:[]};
  if(s.startsWith('SELECT * FROM weekly_risk_reviews WHERE id=$1 FOR UPDATE'))return {rows:weekly?[structuredClone(weekly)]:[]};
  if(s.startsWith("UPDATE weekly_risk_reviews SET status='CANCELLED'")){weekly={...weekly,status:'CANCELLED',cancelled_by:values[1],cancel_reason:values[2],cancelled_at:'2026-11-21T09:00:00Z'};return {rows:[structuredClone(weekly)]}}
  if(s.startsWith("UPDATE weekly_risk_reviews SET status='ARCHIVED'")){weekly={...weekly,status:'ARCHIVED',archived_from_status:values[1],archived_by:values[2],archived_reason:values[3],archived_at:'2026-11-21T10:00:00Z'};return {rows:[structuredClone(weekly)]}}
  if(s.startsWith('UPDATE weekly_risk_reviews SET status=$2,archived_at=NULL')){weekly={...weekly,status:values[1],archived_from_status:null,archived_by:null,archived_at:null,archived_reason:null};return {rows:[structuredClone(weekly)]}}
  if(s.startsWith('UPDATE weekly_risk_revisions SET cancelled_at=')){revision={...revision,cancelled_by:values[1],cancelled_at:values[2],cancel_reason:values[3]};return {rows:[]}}
  if(s.startsWith('INSERT INTO weekly_risk_events')){events.push(values);return {rows:[]}}
  if(s.startsWith('INSERT INTO record_audit')){audits.push(values);return {rows:[]}}
  if(s.startsWith('SELECT * FROM tbms WHERE id=$1 FOR UPDATE'))return {rows:[{id:42,site_id:7}]};
  if(s.startsWith('SELECT * FROM record_approvals WHERE record_type=$1'))return {rows:[structuredClone(direct)]};
  if(s.startsWith('UPDATE record_approvals SET status=')){direct={...direct,status:'CANCELLED'};return {rows:[structuredClone(direct)]}}
  if(s.startsWith('INSERT INTO tbm_approval_events')){events.push(values);return {rows:[]}}
  if(s.startsWith('SELECT * FROM approval_cases WHERE id=$1 FOR UPDATE'))return {rows:[structuredClone(legacy)]};
  if(s.startsWith('UPDATE approval_cases SET status=')){legacy={...legacy,status:'CANCELLED'};return {rows:[structuredClone(legacy)]}}
  if(s.startsWith('INSERT INTO approval_decisions')){decisions.push(values);return {rows:[]}}
  throw Error('SQL not mocked: '+s.slice(0,110));
};
const pool={connect:async()=>({query:run,release(){}})};
const context=vm.createContext({app,auth:()=>{},pool,EDIT_TABLE:{tbm:'tbms'},adminOnly:async(_req,res)=>manager||!!res.status(403).json({error:'관리 권한이 없습니다.'})&&false,JSON,String,Number,Date});
vm.runInContext(source.slice(first,last),context);
const call=async(route,body={},params={})=>{
  assert(handlers[route],`Missing route ${route}`);
  let status=200,data,err;
  const response={status(code){status=code;return this},json(value){data=value;return this}};
  await handlers[route]({body,params,session:{userId:2}},response,e=>{err=e});
  if(err)throw err;
  return {status,data};
};
const cancel='/api/v10/admin/weekly/:id/cancel',archive='/api/v10/admin/weekly/:id/archive',restore='/api/v10/admin/weekly/:id/restore';
let result=await call(cancel,{reason:'테스트용 주간 자료입니다'},{id:91});
assert.equal(result.status,403,'non-admin must be denied');assert.equal(queries,0);
manager=true;
result=await call(cancel,{reason:'짧음'},{id:91});assert.equal(result.status,400);assert.equal(queries,0);
result=await call(archive,{reason:'테스트용 기록이므로 보관'},{id:91});assert.equal(result.status,409);assert.equal(weekly.status,'APPROVED');
result=await call(cancel,{reason:'테스트용 승인 기록 정리'},{id:91});
assert.equal(result.status,200);assert.equal(weekly.status,'CANCELLED');
assert.equal(weekly.approved_by,4,'original approver must survive');assert.equal(weekly.approved_at,'2026-11-20T09:00:00Z');
assert.equal(revision.approved_by,4,'revision approval metadata must survive');assert.equal(revision.cancel_reason,'테스트용 승인 기록 정리');
assert(events.some(x=>x.includes('CANCEL_APPROVAL')),'cancellation must have event log');
result=await call(cancel,{reason:'중복 취소 시도입니다'},{id:91});assert.equal(result.status,409);
result=await call(archive,{reason:'확인된 테스트용 주간 자료'},{id:91});assert.equal(result.status,200);assert.equal(weekly.status,'ARCHIVED');
assert.equal(weekly.archived_from_status,'CANCELLED');
result=await call(restore,{reason:'업무 기록 재확인하여 복원'},{id:91});assert.equal(result.status,200);
assert.equal(weekly.status,'CANCELLED','restore must never revive prior approval');
assert.equal(weekly.approved_by,4);assert.equal(audits.length,3,'cancel, archive, restore all audit');
result=await call('/api/v10/admin/records/:type/:id/cancel-approval',{reason:'테스트 TBM 승인 취소'},{type:'tbm',id:42});
assert.equal(result.status,200);assert.equal(direct.status,'CANCELLED');
result=await call('/api/v10/admin/legacy-case/:id/cancel',{reason:'기존 테스트 결재 취소'},{id:6});
assert.equal(result.status,200);assert.equal(legacy.status,'CANCELLED');assert.equal(decisions.length,1);
console.log('PASS V7.2: admin-only, reason confirmation, cancel/archive/restore, audit, historical approval and legacy cleanup');
