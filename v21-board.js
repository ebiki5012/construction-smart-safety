'use strict';
// V21: a separate, strictly read-only sharing surface. Never broaden the existing write scope.
const modules=['risk','tbm','action'];
const categoryNames=['NOTICE','SAFETY','WORK'];
const isId=v=>Number.isSafeInteger(Number(v))&&Number(v)>0;
const defaultShare=()=>({risk:false,tbm:false,action:false});
function normalizeShare(v){if(!v||Array.isArray(v)||typeof v!=='object'||Object.keys(v).some(k=>!modules.includes(k))||modules.some(k=>typeof v[k]!=='boolean'))return null;return Object.fromEntries(modules.map(k=>[k,v[k]]));}
function audienceAllowed(post,ctx){return !!ctx&&(ctx.manager||post.active&&!post.archived_at&&(post.contractor_id==null||(!ctx.restricted||Number(post.contractor_id)===Number(ctx.contractor_id)&&!!ctx.contractor_id)));}
function boardScope(post,ctx){return !!ctx&&(post.site_id==null||ctx.siteId!==null&&Number(post.site_id)===ctx.siteId)&&audienceAllowed(post,ctx);}
const schema=`ALTER TABLE admin_announcements ADD COLUMN IF NOT EXISTS contractor_id INT REFERENCES contractors(id);
ALTER TABLE admin_announcements ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'NOTICE';
ALTER TABLE admin_announcements ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE admin_announcements ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE admin_announcements ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
ALTER TABLE admin_announcements ADD COLUMN IF NOT EXISTS revision INT NOT NULL DEFAULT 1;
CREATE TABLE IF NOT EXISTS announcement_reads(announcement_id INT NOT NULL REFERENCES admin_announcements(id),user_id INT NOT NULL REFERENCES users(id),revision INT NOT NULL,read_at TIMESTAMPTZ NOT NULL DEFAULT now(),PRIMARY KEY(announcement_id,user_id,revision));
CREATE TABLE IF NOT EXISTS contractor_read_permissions(contractor_id INT PRIMARY KEY REFERENCES contractors(id),risk BOOLEAN NOT NULL DEFAULT false,tbm BOOLEAN NOT NULL DEFAULT false,action BOOLEAN NOT NULL DEFAULT false,updated_by INT REFERENCES users(id),updated_at TIMESTAMPTZ NOT NULL DEFAULT now());`;
function register({app,auth,q,one,pool,user,siteRole,companyScope}){
 const err=(res,status,error)=>res.status(status).json({error});
 const safe=fn=>async(req,res,next)=>{try{await fn(req,res)}catch(e){next(e)}};
 async function context(req,value){const u=await user(req);if(value==='all')return u?.role==='ADMIN'?{siteId:null,manager:true,global:true,restricted:false,contractor_id:null}:null;
  if(!isId(value))return null;const siteId=Number(value);const scope=await companyScope(req,siteId);if(!scope.allowed||!await one('SELECT id FROM sites WHERE id=$1',[siteId]))return null;
  const role=await siteRole(req,siteId);return {...scope,siteId,manager:role==='ADMIN'||role==='MANAGER',global:u.role==='ADMIN'};
 }
 const audit=async(req,category,action,id,details)=>pool.query('INSERT INTO admin_events(actor_id,category,action,object_id,details) VALUES($1,$2,$3,$4,$5::jsonb)',[req.session.userId,category,action,String(id),JSON.stringify(details)]);
 app.get('/api/v21/board',auth,safe(async(req,res)=>{
  const ctx=await context(req,req.query.site_id);if(!ctx)return err(res,403,'현장 권한이 없습니다.');
  const rows=await q(`SELECT a.id,a.site_id,a.contractor_id,a.title,a.body,a.category,a.pinned,a.active,a.archived_at,a.created_at,a.updated_at,a.revision,u.name author_name,c.name contractor_name,
   EXISTS(SELECT 1 FROM announcement_reads ar WHERE ar.announcement_id=a.id AND ar.user_id=$2 AND ar.revision=a.revision) AS acknowledged
   FROM admin_announcements a LEFT JOIN users u ON u.id=a.created_by LEFT JOIN contractors c ON c.id=a.contractor_id
   WHERE (a.site_id IS NULL OR a.site_id=$1) AND (a.active AND a.archived_at IS NULL OR ($3 AND (a.site_id=$1 OR $4)))
   AND (a.contractor_id IS NULL OR NOT $5 OR a.contractor_id=$6) ORDER BY a.pinned DESC,a.id DESC LIMIT 250`,[ctx.siteId,req.session.userId,ctx.manager&&req.query.manage==='1',ctx.global,ctx.restricted,ctx.contractor_id||-1]);
  const visible=rows.filter(r=>boardScope(r,ctx)&&(r.active&&!r.archived_at||ctx.manager&&req.query.manage==='1'&&(r.site_id!=null||ctx.global))).map(r=>({...r,editable:ctx.manager&&(r.site_id!=null||ctx.global)}));
  res.json({manager:ctx.manager,global:ctx.global,rows:visible});
 }));
 app.post('/api/v21/board',auth,safe(async(req,res)=>{
  const ctx=await context(req,req.body.site_id);if(!ctx?.manager)return err(res,403,'현장관리자만 공지를 등록할 수 있습니다.');
  const title=String(req.body.title||'').trim(),body=String(req.body.body||'').trim(),category=req.body.category||'NOTICE',cid=req.body.contractor_id==null||req.body.contractor_id===''?null:Number(req.body.contractor_id);
  if(!title||title.length>150||!body||body.length>5000||!categoryNames.includes(category)||typeof req.body.pinned!=='boolean')return err(res,400,'제목, 내용, 분류를 확인하세요.');
  if(cid!==null&&(!ctx.siteId||!isId(cid)||!await one('SELECT id FROM contractors WHERE id=$1 AND site_id=$2 AND active=true',[cid,ctx.siteId])))return err(res,400,'해당 현장의 활성 업체를 선택하세요.');
  const row=await one('INSERT INTO admin_announcements(site_id,contractor_id,title,body,category,pinned,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',[ctx.siteId,cid,title,body,category,req.body.pinned,req.session.userId]);
  await audit(req,'announcement','CREATE',row.id,{site_id:ctx.siteId,contractor_id:cid});res.status(201).json(row);
 }));
 app.patch('/api/v21/board/:id',auth,safe(async(req,res)=>{
  if(!isId(req.params.id))return err(res,404,'게시글이 없습니다.');const a=await one('SELECT * FROM admin_announcements WHERE id=$1',[req.params.id]);if(!a)return err(res,404,'게시글이 없습니다.');
  const ctx=await context(req,a.site_id??'all');if(!ctx?.manager)return err(res,403,'게시글 관리 권한이 없습니다.');
  const action=req.body.action; if(!['EDIT','ARCHIVE','RESTORE','HIDE','PUBLISH'].includes(action))return err(res,400,'작업을 확인하세요.');
  if(action==='EDIT'){
   if(a.archived_at)return err(res,409,'보관된 게시글을 복구하세요.');const title=String(req.body.title||'').trim(),body=String(req.body.body||'').trim(),category=req.body.category,cid=req.body.contractor_id==null||req.body.contractor_id===''?null:Number(req.body.contractor_id);
   if(!title||title.length>150||!body||body.length>5000||!categoryNames.includes(category)||typeof req.body.pinned!=='boolean')return err(res,400,'게시글 내용을 확인하세요.');
   if(cid!==null&&(!ctx.siteId||!isId(cid)||!await one('SELECT id FROM contractors WHERE id=$1 AND site_id=$2 AND active=true',[cid,ctx.siteId])))return err(res,400,'해당 현장의 활성 업체를 선택하세요.');
   await pool.query('UPDATE admin_announcements SET title=$1,body=$2,category=$3,pinned=$4,contractor_id=$5,updated_at=now(),revision=revision+1 WHERE id=$6 AND archived_at IS NULL',[title,body,category,req.body.pinned,cid,a.id]);
  }else if(action==='ARCHIVE')await pool.query('UPDATE admin_announcements SET active=false,archived_at=now(),updated_at=now() WHERE id=$1 AND archived_at IS NULL',[a.id]);
  else if(action==='RESTORE')await pool.query('UPDATE admin_announcements SET active=false,archived_at=NULL,updated_at=now() WHERE id=$1 AND archived_at IS NOT NULL',[a.id]);
  else if(!a.archived_at)await pool.query('UPDATE admin_announcements SET active=$1,updated_at=now() WHERE id=$2 AND archived_at IS NULL',[action==='PUBLISH',a.id]);
  else return err(res,409,'보관된 게시글을 복구하세요.');
  await audit(req,'announcement',action,a.id,{site_id:a.site_id});res.json({ok:true});
 }));
 app.post('/api/v21/board/:id/read',auth,safe(async(req,res)=>{
  if(!isId(req.params.id))return err(res,404,'게시글이 없습니다.');const ctx=await context(req,req.body.site_id);if(!ctx)return err(res,403,'현장 권한이 없습니다.');
  const a=await one('SELECT * FROM admin_announcements WHERE id=$1',[req.params.id]);if(!a||!a.active||a.archived_at||!boardScope(a,ctx))return err(res,404,'게시글이 없습니다.');
  if(Number(req.body.revision)!==a.revision)return err(res,409,'게시글이 수정되었습니다. 다시 읽어 주세요.');
  await pool.query(`INSERT INTO announcement_reads(announcement_id,user_id,revision) SELECT id,$2,revision FROM admin_announcements WHERE id=$1 AND revision=$3 AND active AND archived_at IS NULL ON CONFLICT DO NOTHING`,[a.id,req.session.userId,a.revision]);res.json({ok:true});
 }));
 app.get('/api/v21/board/:id/receipts',auth,safe(async(req,res)=>{
  if(!isId(req.params.id))return err(res,404,'게시글이 없습니다.');const a=await one('SELECT * FROM admin_announcements WHERE id=$1',[req.params.id]);if(!a)return err(res,404,'게시글이 없습니다.');const ctx=await context(req,a.site_id??'all');if(!ctx?.manager)return err(res,403,'게시글 관리 권한이 없습니다.');
  // Current active audience, not a historical recipient manifest. Only authorized managers see names.
  const rows=await q(`SELECT u.id,u.name,u.username,ar.read_at,COALESCE((SELECT string_agg(s.name,', ' ORDER BY s.name) FROM memberships m JOIN sites s ON s.id=m.site_id WHERE m.user_id=u.id AND ($1::int IS NULL OR m.site_id=$1)),'본사') site_name
   FROM users u LEFT JOIN announcement_reads ar ON ar.user_id=u.id AND ar.announcement_id=$3 AND ar.revision=$4
   WHERE u.active AND u.archived_at IS NULL AND (u.role='ADMIN' OR EXISTS(SELECT 1 FROM memberships m LEFT JOIN contractor_memberships cm ON cm.user_id=m.user_id AND cm.site_id=m.site_id WHERE m.user_id=u.id AND ($1::int IS NULL OR m.site_id=$1) AND ($2::int IS NULL OR m.role IN ('ADMIN','MANAGER','SAFETY_MANAGER','SITE_DIRECTOR') OR cm.contractor_id=$2))) ORDER BY ar.read_at NULLS FIRST,u.name`,[a.site_id,a.contractor_id,a.id,a.revision]);res.json(rows);
 }));
 app.get('/api/v21/company-permissions',auth,safe(async(req,res)=>{const ctx=await context(req,req.query.site_id);if(!ctx?.manager||!ctx.siteId)return err(res,403,'현장관리자 권한이 필요합니다.');res.json(await q(`SELECT c.id,c.name,COALESCE(p.risk,false) risk,COALESCE(p.tbm,false) tbm,COALESCE(p.action,false) action FROM contractors c LEFT JOIN contractor_read_permissions p ON p.contractor_id=c.id WHERE c.site_id=$1 AND c.active=true ORDER BY c.name`,[ctx.siteId]));}));
 app.put('/api/v21/company-permissions/:id',auth,safe(async(req,res)=>{const ctx=await context(req,req.body.site_id);if(!ctx?.manager||!ctx.siteId)return err(res,403,'현장관리자 권한이 필요합니다.');const p=normalizeShare(req.body.permissions),cid=Number(req.params.id);if(!p||!isId(cid)||!await one('SELECT id FROM contractors WHERE id=$1 AND site_id=$2 AND active=true',[cid,ctx.siteId]))return err(res,400,'업체와 권한을 확인하세요.');await pool.query(`INSERT INTO contractor_read_permissions(contractor_id,risk,tbm,action,updated_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(contractor_id) DO UPDATE SET risk=EXCLUDED.risk,tbm=EXCLUDED.tbm,action=EXCLUDED.action,updated_by=EXCLUDED.updated_by,updated_at=now()`,[cid,p.risk,p.tbm,p.action,req.session.userId]);await audit(req,'company_permissions','UPDATE',cid,{site_id:ctx.siteId,...p});res.json({ok:true});}));
 app.get('/api/v21/shared',auth,safe(async(req,res)=>{
  const ctx=await context(req,req.query.site_id);if(!ctx?.siteId)return err(res,403,'개별 현장을 선택하세요.');
  const permissions=ctx.restricted?(ctx.contractor_id?await one('SELECT p.risk,p.tbm,p.action FROM contractor_read_permissions p JOIN contractors c ON c.id=p.contractor_id WHERE c.id=$1 AND c.site_id=$2 AND c.active=true',[ctx.contractor_id,ctx.siteId])||defaultShare():defaultShare()):{risk:true,tbm:true,action:true};
  const type=String(req.query.type||'risk');if(!modules.includes(type))return err(res,400,'자료 유형을 확인하세요.');if(!permissions[type])return res.json({permissions,rows:[]});
  // Only final, non-archived snapshots and confirmed records. No author IDs, private photos, approval comments or mutation URLs are exposed.
  const sql={risk:`SELECT w.week_start AS record_date,COALESCE(x->>'contractor_name','원청 / 업체 미지정') company,x->>'area' area,x->>'work' title,x->>'hazard' hazard,x->>'measure' measure,x->>'score' score FROM weekly_risk_reviews w CROSS JOIN LATERAL jsonb_array_elements(COALESCE(w.snapshot,'[]'::jsonb)) x WHERE w.site_id=$1 AND w.status='APPROVED' AND w.archived_at IS NULL ORDER BY w.week_start DESC,w.id DESC LIMIT 500`,tbm:`SELECT t.tbm_date record_date,COALESCE(c.name,'원청 / 업체 미지정') company,t.team area,t.work_name title,t.hazard,t.measure FROM tbms t JOIN record_approvals r ON r.record_type='tbm' AND r.record_id=t.id AND r.site_id=t.site_id LEFT JOIN contractors c ON c.id=t.contractor_id WHERE t.site_id=$1 AND t.deleted_at IS NULL AND r.status='APPROVED' ORDER BY t.tbm_date DESC,t.id DESC LIMIT 500`,action:`SELECT a.verified_at record_date,COALESCE(c.name,'원청 / 업체 미지정') company,a.issue_text hazard,a.item measure,'조치 완료 확인' title FROM actions a LEFT JOIN contractors c ON c.id=a.contractor_id WHERE a.site_id=$1 AND a.deleted_at IS NULL AND a.status='DONE' AND a.verified_at IS NOT NULL ORDER BY a.verified_at DESC,a.id DESC LIMIT 500`}[type];
  res.json({permissions,rows:await q(sql,[ctx.siteId])});
 }));
}
module.exports={register,schema,normalizeShare,audienceAllowed,boardScope,defaultShare};
