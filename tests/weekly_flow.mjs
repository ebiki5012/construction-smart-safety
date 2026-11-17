// Offline business-flow regression checks with an in-memory SQL stub.
// This does NOT replace testing against a real PostgreSQL database.
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
function extract(start,end){const a=source.indexOf(start),b=source.indexOf(end,a+start.length);assert(a>=0&&b>a,`route missing ${start}`);return source.slice(a,b)}
const handlers={};
const app={post:(path,auth,fn)=>handlers[path]=fn};
const rows=[{id:11,area:'1층',work:'철근',hazard:'추락',measure:'난간',frequency:2,severity:3,score:6,level:'높음',contractor_id:5,contractor_name:'A건설',author_name:'홍길동',risk_date:'2026-11-09',period_start:'2026-11-09',period_end:'2026-11-15'}];
let weekly=null,events=[],revisions=[],allowed=true,companies=[];
const query=async(sql,args=[])=>{
 const clean=sql.trim();
 if(['BEGIN','COMMIT','ROLLBACK'].includes(clean))return {rows:[]};
 if(clean.startsWith('SELECT * FROM weekly_risk_reviews WHERE site_id'))return {rows:weekly?[weekly]:[]};
 if(clean.startsWith('SELECT r.id,r.area,r.work,r.hazard'))return {rows:structuredClone(rows)};
 if(clean.startsWith('SELECT DISTINCT r.contractor_id'))return {rows:companies};
 if(clean.startsWith('INSERT INTO weekly_risk_reviews')){weekly={id:1,site_id:1,week_start:args[1],status:'PENDING',revision:1,snapshot:JSON.parse(args[6]),snapshot_hash:args[7],meeting_notes:args[2],attendees:args[3]};return {rows:[structuredClone(weekly)]}}
 if(clean.startsWith('UPDATE weekly_risk_reviews SET status=\'PENDING\'')){weekly={...weekly,status:'PENDING',revision:args[1],snapshot:JSON.parse(args[2]),snapshot_hash:args[3],meeting_notes:args[4],attendees:args[5]};return {rows:[structuredClone(weekly)]}}
 if(clean.startsWith('SELECT * FROM weekly_risk_reviews WHERE id=$1 FOR UPDATE'))return {rows:weekly?[weekly]:[]};
 if(clean.startsWith('UPDATE weekly_risk_reviews SET status=$2')){weekly={...weekly,status:args[1],approved_by:args[2],decision_comment:args[3]};return {rows:[structuredClone(weekly)]}}
 if(clean.startsWith('UPDATE weekly_risk_revisions SET approved_by')){const rev=revisions.find(r=>r.revision===args[3]);if(rev){rev.approved_by=args[1];rev.approved_at=args[2]}return {rows:[]}}
 if(clean.startsWith('INSERT INTO weekly_risk_revisions')){revisions.push({revision:args[1],snapshot:JSON.parse(args[2])});return {rows:[]}}
 if(clean.startsWith('INSERT INTO weekly_risk_events')){events.push({revision:args[1],action:args[2]||'SUBMIT'});return {rows:[]}}
 if(clean.startsWith('INSERT INTO weekly_risk_items')||clean.startsWith('DELETE FROM weekly_risk_items'))return {rows:[]};
 throw new Error('SQL stub missing '+clean.slice(0,100));
};
const pool={connect:async()=>({query,release(){}})};
const context=vm.createContext({app,auth:()=>{},can:async()=>allowed,pool,weeklyRowsSql:'SELECT r.id,r.area,r.work,r.hazard',validMonday:s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&new Date(s+'T00:00:00Z').getUTCDay()===1,isoDate:x=>String(x||'').slice(0,10),crypto,console,JSON,Number,String,Date});
vm.runInContext(extract("app.post('/api/v7/weekly'","app.get('/api/v7/weekly/:id/items'"),context);
vm.runInContext(extract("app.post('/api/v7/weekly/:id/decision'","app.get('/api/v8/weekly/:id/report'"),context);
async function call(route,body,params={}){let status=200,data,error;const res={status(n){status=n;return this},json(x){data=x;return this}};await handlers[route]({body,params,session:{userId:10}},res,e=>error=e);if(error)throw error;return {status,data}}
const submit='/api/v7/weekly',decision='/api/v7/weekly/:id/decision';
let result=await call(submit,{site_id:1,week_start:'2026-11-09',meeting_notes:'회의 내용',attendees:'A건설'});
assert.equal(result.status,200);assert.equal(weekly.status,'PENDING');assert.equal(weekly.snapshot[0].hazard,'추락');assert.equal(revisions.length,1);
result=await call(submit,{site_id:1,week_start:'2026-11-09'});assert.equal(result.status,409);
rows[0].hazard='변경된 내용';
result=await call(decision,{action:'APPROVE',comment:''},{id:1});assert.equal(result.status,200);assert.equal(weekly.status,'APPROVED');assert.equal(weekly.snapshot[0].hazard,'추락');
result=await call(decision,{action:'APPROVE'},{id:1});assert.equal(result.status,409);
weekly.status='REJECTED';
result=await call(submit,{site_id:1,week_start:'2026-11-09',meeting_notes:'수정 회의'});assert.equal(result.status,200);assert.equal(weekly.revision,2);assert.equal(revisions.length,2);assert.equal(revisions[0].snapshot[0].hazard,'추락');assert.equal(revisions[1].snapshot[0].hazard,'변경된 내용');
allowed=false;result=await call(decision,{action:'APPROVE'},{id:1});assert.equal(result.status,403);
console.log('PASS weekly: first submission, duplicate guard, approval lock, revision history, role denial');
