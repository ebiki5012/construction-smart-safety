// Official review endpoints, admin read-only dashboard and legacy attribution.
// Runs without PostgreSQL; production DB integration still requires staging QA.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
const admin=fs.readFileSync(new URL('../public/admin-center.html',import.meta.url),'utf8');
const main=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
function extract(from,to){const a=source.indexOf(from),b=source.indexOf(to,a+from.length);assert(a>=0&&b>a,from);return source.slice(a,b)}
assert(!admin.includes('onclick="saveApproval()"'));
assert(!admin.includes('onclick="submitWorkflow()"'));
assert(!admin.includes('onclick="decideCase('));
assert(admin.includes('weeklyApprovalOverview')&&admin.includes('tbmApprovalOverview'));
assert(main.includes('v9UnassignedRecords'));

const handlers={},app={get:(p,a,fn)=>handlers['GET '+p]=fn,post:(p,a,fn)=>handlers['POST '+p]=fn,patch:(p,a,fn)=>handlers['PATCH '+p]=fn,put:(p,a,fn)=>handlers['PUT '+p]=fn};
let allowed=true,locked=false,record={id:12,site_id:1,contractor_id:null,entry_mode:'DIRECT',work:'철근 설치'},audit=[],writes=0;
const one=async(sql,args)=>{
 if(sql.includes('FROM contractors WHERE'))return Number(args[0])===7&&Number(args[1])===1?{id:7}:null;
 if(sql.includes('FROM approval_cases WHERE'))return {record_type:'risk'};
 throw Error('Unexpected one SQL: '+sql.slice(0,100));
};
const q=async(sql)=>{
 if(sql.includes('FROM weekly_risk_reviews w'))return [{id:10,status:'PENDING',item_count:3}];
 if(sql.includes("FROM record_approvals a JOIN tbms"))return [{id:12,status:'SUBMITTED'}];
 if(sql.includes('FROM approval_cases WHERE site_id'))return [{id:5,record_type:'risk',status:'PENDING'}];
 if(sql.includes('FROM risks r LEFT JOIN users'))return [{id:12,kind:'risk'}];
 if(sql.includes('FROM tbms t LEFT JOIN users'))return [{id:13,kind:'tbm'}];
 throw Error('Unexpected q SQL: '+sql.slice(0,100));
};
const query=async(sql,args=[])=>{
 const clean=sql.trim();
 if(['BEGIN','COMMIT','ROLLBACK'].includes(clean))return {rows:[]};
 if(clean.startsWith('SELECT * FROM risks WHERE'))return {rows:record?[{...record}]:[]};
 if(clean.startsWith('SELECT id FROM weekly_risk_reviews'))return {rows:locked?[{id:8}]:[]};
 if(clean.startsWith('UPDATE risks SET contractor_id')){writes++;record={...record,contractor_id:args[0],entry_mode:args[1]};return {rows:[{...record}]}}
 if(clean.startsWith('INSERT INTO record_audit')){audit.push(args);return {rows:[]}}
 throw Error('Unexpected client SQL: '+clean.slice(0,100));
};
const pool={connect:async()=>({query,release(){}})};
const ctx=vm.createContext({app,auth:()=>{},can:async()=>allowed,q,one,pool,user:async()=>({id:99,role:'ADMIN'}),console});
for(const [start,end] of [
 ["app.get('/api/v9/approval-overview'","// Explicit historical company attribution"],
 ["app.get('/api/v9/unassigned-records'","app.patch('/api/v9/records/:kind/:id/contractor'"],
 ["app.patch('/api/v9/records/:kind/:id/contractor'","app.put('/api/admin/approvals/:type/:id'"],
 ["app.put('/api/admin/approvals/:type/:id'","app.get('/api/admin/announcements'"],
 ["app.post('/api/v5/cases'","app.post('/api/v5/cases/:id/decision'"],
 ["app.post('/api/v5/cases/:id/decision'","// Photo trash"],
])vm.runInContext(extract(start,end),ctx);
async function call(method,path,{query:qs={},body={},params={}}={}){
 let status=200,data,exception;
 const res={status(n){status=n;return this},json(v){data=v;return this}};
 await handlers[method+' '+path]({query:qs,body,params,session:{userId:99}},res,e=>exception=e);
 if(exception)throw exception;
 return {status,data};
}
let out=await call('GET','/api/v9/approval-overview',{query:{site_id:'1'}});
assert.equal(out.status,200);assert.equal(out.data.weekly[0].status,'PENDING');assert.equal(out.data.tbm[0].status,'SUBMITTED');assert.equal(writes,0);
out=await call('GET','/api/v9/unassigned-records',{query:{site_id:'1'}});
assert.equal(out.status,200);assert.equal(out.data.length,2);
out=await call('PUT','/api/admin/approvals/:type/:id',{params:{type:'risk',id:'12'},body:{status:'APPROVED'}});
assert.equal(out.status,409);assert.equal(writes,0);
out=await call('POST','/api/v5/cases',{body:{record_type:'risk',record_id:12,site_id:1}});
assert.equal(out.status,409);assert.equal(writes,0);
out=await call('POST','/api/v5/cases/:id/decision',{params:{id:'5'},body:{action:'APPROVE'}});
assert.equal(out.status,409);assert.equal(writes,0);
out=await call('PATCH','/api/v9/records/:kind/:id/contractor',{params:{kind:'risk',id:'12'},body:{site_id:1,contractor_id:'8'}});
assert.equal(out.status,400);
locked=true;
out=await call('PATCH','/api/v9/records/:kind/:id/contractor',{params:{kind:'risk',id:'12'},body:{site_id:1,contractor_id:'7'}});
assert.equal(out.status,409);assert.equal(writes,0);
locked=false;allowed=false;
out=await call('PATCH','/api/v9/records/:kind/:id/contractor',{params:{kind:'risk',id:'12'},body:{site_id:1,contractor_id:'7'}});
assert.equal(out.status,403);assert.equal(writes,0);
allowed=true;
out=await call('PATCH','/api/v9/records/:kind/:id/contractor',{params:{kind:'risk',id:'12'},body:{site_id:1,contractor_id:'7'}});
assert.equal(out.status,200);assert.equal(out.data.contractor_id,7);assert.equal(writes,1);assert.equal(audit.length,1);
out=await call('PATCH','/api/v9/records/:kind/:id/contractor',{params:{kind:'risk',id:'12'},body:{site_id:1,contractor_id:'7'}});
assert.equal(out.status,409);assert.equal(writes,1);
console.log('PASS unified: read-only admin, legacy guards, manager permission, approval lock, audited company attribution');
