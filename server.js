const express=require("express");
const session=require("express-session");
const pgSession=require("connect-pg-simple")(session);
const {Pool}=require("pg");
const bcrypt=require("bcryptjs");
const path=require("path");
const crypto=require("crypto");
const multer=require("multer");
const {S3Client,PutObjectCommand,GetObjectCommand,DeleteObjectCommand}=require("@aws-sdk/client-s3");
const photoUpload=multer({storage:multer.memoryStorage(),limits:{fileSize:8*1024*1024,files:5},fileFilter:(req,file,cb)=>cb(null,["image/jpeg","image/png","image/webp"].includes(file.mimetype))});
const r2Ready=()=>["R2_ACCOUNT_ID","R2_ACCESS_KEY_ID","R2_SECRET_ACCESS_KEY","R2_BUCKET"].every(k=>process.env[k]);
const r2=()=>new S3Client({region:"auto",endpoint:`https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,credentials:{accessKeyId:process.env.R2_ACCESS_KEY_ID,secretAccessKey:process.env.R2_SECRET_ACCESS_KEY}});
const bucket=()=>process.env.R2_BUCKET;


const app=express();
app.set("trust proxy",1);
const PORT=process.env.PORT||3000;
const DATABASE_URL=process.env.DATABASE_URL;
if(!DATABASE_URL){
  console.error("DATABASE_URL is required. For local testing, set DATABASE_URL to a PostgreSQL connection string.");
  process.exit(1);
}
const pool=new Pool({connectionString:DATABASE_URL,ssl:process.env.NODE_ENV==="production"?{rejectUnauthorized:false}:false});

app.use(express.json({limit:"10mb"}));
app.use(express.urlencoded({extended:true}));
app.use(session({
  store:new pgSession({pool,createTableIfMissing:true}),
  secret:process.env.SESSION_SECRET||"change-this-secret",
  resave:false,saveUninitialized:false,
  cookie:{maxAge:1000*60*60*12,secure:process.env.NODE_ENV==="production"}
}));
app.use(express.static(path.join(__dirname,"public")));

async function q(sql,params=[]){return (await pool.query(sql,params)).rows}
async function one(sql,params=[]){return (await pool.query(sql,params)).rows[0]}

async function init(){
 await pool.query(`
 CREATE TABLE IF NOT EXISTS users(
   id SERIAL PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,
   password_hash TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'USER',
   active BOOLEAN NOT NULL DEFAULT TRUE,created_at TIMESTAMPTZ DEFAULT now()
 );
 CREATE TABLE IF NOT EXISTS sites(
   id SERIAL PRIMARY KEY,name TEXT NOT NULL,address TEXT DEFAULT '',
   start_date DATE,end_date DATE,status TEXT DEFAULT '진행중',
   created_at TIMESTAMPTZ DEFAULT now()
 );
 CREATE TABLE IF NOT EXISTS memberships(
   user_id INT REFERENCES users(id) ON DELETE CASCADE,
   site_id INT REFERENCES sites(id) ON DELETE CASCADE,
   role TEXT NOT NULL DEFAULT 'USER',
   PRIMARY KEY(user_id,site_id)
 );
 CREATE TABLE IF NOT EXISTS settings(
   site_id INT PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE,
   frequency_labels JSONB NOT NULL DEFAULT '{"1":"거의 발생하지 않음","2":"가끔 발생","3":"자주 발생"}',
   severity_labels JSONB NOT NULL DEFAULT '{"1":"경미","2":"중대","3":"치명적"}',
   low_max INT NOT NULL DEFAULT 3, medium_max INT NOT NULL DEFAULT 5
 );
 CREATE TABLE IF NOT EXISTS risks(
   id SERIAL PRIMARY KEY,site_id INT REFERENCES sites(id) ON DELETE CASCADE,
   risk_date DATE DEFAULT CURRENT_DATE,area TEXT,work TEXT,hazard TEXT,
   frequency INT,severity INT,score INT,level TEXT,measure TEXT,
   author_id INT REFERENCES users(id),created_at TIMESTAMPTZ DEFAULT now()
 );
 CREATE TABLE IF NOT EXISTS templates(
   id SERIAL PRIMARY KEY,site_id INT REFERENCES sites(id) ON DELETE CASCADE,
   name TEXT,area TEXT,work TEXT,hazard TEXT,frequency INT,severity INT,
   score INT,level TEXT,measure TEXT,created_at TIMESTAMPTZ DEFAULT now()
 );
 CREATE TABLE IF NOT EXISTS actions(
   id SERIAL PRIMARY KEY,site_id INT REFERENCES sites(id) ON DELETE CASCADE,
   risk_id INT REFERENCES risks(id) ON DELETE SET NULL,item TEXT,manager TEXT,
   due_date DATE,status TEXT DEFAULT 'OPEN',completed_at TIMESTAMPTZ
 );
 CREATE TABLE IF NOT EXISTS tbms(
   id SERIAL PRIMARY KEY,site_id INT REFERENCES sites(id) ON DELETE CASCADE,
   tbm_date DATE DEFAULT CURRENT_DATE,team TEXT,work_name TEXT,people INT,
   hazard TEXT,measure TEXT,risk_id INT REFERENCES risks(id) ON DELETE SET NULL,
   created_by INT REFERENCES users(id),created_at TIMESTAMPTZ DEFAULT now()
 );
 `);
 await pool.query(`CREATE TABLE IF NOT EXISTS record_photos(
 id SERIAL PRIMARY KEY,site_id INT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
 record_type TEXT NOT NULL CHECK(record_type IN ('risk','tbm','action')),
 record_id INT NOT NULL,object_key TEXT NOT NULL UNIQUE,
 original_name TEXT NOT NULL,mime_type TEXT NOT NULL,
 byte_size INT NOT NULL,uploaded_by INT REFERENCES users(id),created_at TIMESTAMPTZ DEFAULT now()
 );CREATE INDEX IF NOT EXISTS record_photos_lookup ON record_photos(record_type,record_id);`);
 await pool.query(`ALTER TABLE record_photos DROP CONSTRAINT IF EXISTS record_photos_record_type_check;
 ALTER TABLE record_photos ADD CONSTRAINT record_photos_record_type_check CHECK(record_type IN ('risk','tbm','action'));
 ALTER TABLE record_photos ADD COLUMN IF NOT EXISTS photo_stage TEXT NOT NULL DEFAULT 'general';
 CREATE TABLE IF NOT EXISTS custom_forms(id SERIAL PRIMARY KEY,title TEXT NOT NULL,description TEXT DEFAULT '',icon TEXT DEFAULT '📋',active BOOLEAN NOT NULL DEFAULT TRUE,sort_order INT NOT NULL DEFAULT 100,created_at TIMESTAMPTZ DEFAULT now());
 CREATE TABLE IF NOT EXISTS custom_fields(id SERIAL PRIMARY KEY,form_id INT NOT NULL REFERENCES custom_forms(id) ON DELETE CASCADE,label TEXT NOT NULL,field_type TEXT NOT NULL CHECK(field_type IN ('text','textarea','date','number','select','photo')),options JSONB NOT NULL DEFAULT '[]',required BOOLEAN NOT NULL DEFAULT FALSE,active BOOLEAN NOT NULL DEFAULT TRUE,sort_order INT NOT NULL DEFAULT 100);
 CREATE TABLE IF NOT EXISTS custom_records(id SERIAL PRIMARY KEY,form_id INT NOT NULL REFERENCES custom_forms(id),site_id INT NOT NULL REFERENCES sites(id),record_date DATE NOT NULL DEFAULT CURRENT_DATE,form_data JSONB NOT NULL DEFAULT '{}',created_by INT REFERENCES users(id),created_at TIMESTAMPTZ NOT NULL DEFAULT now());
 CREATE INDEX IF NOT EXISTS custom_records_site_date ON custom_records(site_id,record_date DESC);
 CREATE TABLE IF NOT EXISTS custom_record_photos(id SERIAL PRIMARY KEY,record_id INT NOT NULL REFERENCES custom_records(id) ON DELETE CASCADE,field_id INT NOT NULL REFERENCES custom_fields(id),object_key TEXT NOT NULL UNIQUE,original_name TEXT NOT NULL,mime_type TEXT NOT NULL,byte_size INT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now());`);
 await pool.query(`
 ALTER TABLE custom_records ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
 ALTER TABLE custom_records ADD COLUMN IF NOT EXISTS deleted_by INT;
 ALTER TABLE custom_forms ADD COLUMN IF NOT EXISTS site_id INT REFERENCES sites(id);
 CREATE TABLE IF NOT EXISTS admin_audit(id BIGSERIAL PRIMARY KEY,actor_id INT,site_id INT,action TEXT NOT NULL,target_type TEXT,target_id INT,details JSONB NOT NULL DEFAULT '{}',created_at TIMESTAMPTZ NOT NULL DEFAULT now());
 CREATE INDEX IF NOT EXISTS admin_audit_recent ON admin_audit(created_at DESC);
 CREATE TABLE IF NOT EXISTS record_approvals(id BIGSERIAL PRIMARY KEY,site_id INT NOT NULL REFERENCES sites(id),record_type TEXT NOT NULL,record_id INT NOT NULL,step INT NOT NULL DEFAULT 1,status TEXT NOT NULL CHECK(status IN ('PENDING','APPROVED','REJECTED')),comment TEXT NOT NULL DEFAULT '',actor_id INT REFERENCES users(id),created_at TIMESTAMPTZ NOT NULL DEFAULT now());
 CREATE INDEX IF NOT EXISTS record_approvals_lookup ON record_approvals(site_id,record_type,record_id,created_at DESC);
 CREATE TABLE IF NOT EXISTS site_notices(id BIGSERIAL PRIMARY KEY,site_id INT REFERENCES sites(id),title TEXT NOT NULL,body TEXT NOT NULL,active BOOLEAN NOT NULL DEFAULT TRUE,created_by INT REFERENCES users(id),created_at TIMESTAMPTZ NOT NULL DEFAULT now());
 `);
 await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0");
 await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT");
 await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_unique ON users (lower(username)) WHERE username IS NOT NULL");
 const admin=await one("SELECT id FROM users WHERE role='ADMIN' ORDER BY id LIMIT 1");
 if(!admin){
   const ph=await bcrypt.hash("admin1234",10);
   const u=await one("INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,'ADMIN') RETURNING id",
     ["시스템 관리자","admin@site.local",ph]);
   const s=await one("INSERT INTO sites(name,address,status) VALUES($1,$2,'진행중') RETURNING id",
     ["○○아파트 신축공사","서울시 ○○구"]);
   await pool.query("INSERT INTO memberships(user_id,site_id,role) VALUES($1,$2,'ADMIN')",[u.id,s.id]);
   await pool.query("INSERT INTO settings(site_id) VALUES($1)",[s.id]);
 }
}
async function auth(req,res,next){
 try {
  if(!req.session.userId)return res.status(401).json({error:"로그인이 필요합니다."});
  const u=await one("SELECT active,session_version FROM users WHERE id=$1",[req.session.userId]);
  if(!u||!u.active||req.session.sessionVersion!==u.session_version)return req.session.destroy(()=>res.status(401).json({error:"로그인 상태가 만료되었습니다. 다시 로그인하세요."}));
  next();
 }catch(e){next(e)}
}
async function user(req){return one("SELECT id,name,email,username,role,active FROM users WHERE id=$1",[req.session.userId])}
async function can(req,siteId,roles=[]){
 const u=await user(req); if(!u||!u.active)return false;
 const m=await one("SELECT role FROM memberships WHERE user_id=$1 AND site_id=$2",[u.id,siteId]);
 return !!m && (!roles.length||roles.includes(u.role)||roles.includes(m.role));
}
function riskCalc(f,s,setting){
 const freq=Number(f)||1,sev=Number(s)||1,score=freq*sev;
 const level=score<=setting.low_max?"낮음":score<=setting.medium_max?"보통":"높음";
 return {frequency:freq,severity:sev,score,level};
}

app.post("/api/login",async(req,res)=>{
 const identifier=String(req.body.identifier||req.body.email||"").toLowerCase().trim(),password=String(req.body.password||"");
 const u=await one("SELECT * FROM users WHERE (lower(email)=$1 OR lower(username)=$1) AND active=true",[identifier]);
 if(!u||!(await bcrypt.compare(password,u.password_hash)))return res.status(401).json({error:"아이디 또는 비밀번호가 맞지 않습니다."});
 req.session.userId=u.id;req.session.sessionVersion=u.session_version;res.json({user:{id:u.id,name:u.name,email:u.email,role:u.role}});
});
app.post("/api/logout",auth,(req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.get("/api/me",auth,async(req,res)=>res.json({user:await user(req)}));
app.patch("/api/me/username",auth,async(req,res)=>{
 const username=String(req.body.username||"").trim().toLowerCase();
 if(!/^[a-z][a-z0-9._-]{3,29}$/.test(username))return res.status(400).json({error:"아이디는 영문자로 시작하는 4~30자 영문·숫자·._-만 가능합니다."});
 const current=await one("SELECT password_hash FROM users WHERE id=$1",[req.session.userId]);
 if(!current||!(await bcrypt.compare(String(req.body.password||""),current.password_hash)))return res.status(403).json({error:"현재 비밀번호가 일치하지 않습니다."});
 const conflict=await one("SELECT id FROM users WHERE id<>$1 AND (lower(username)=$2 OR lower(email)=$2)",[req.session.userId,username]);
 if(conflict)return res.status(409).json({error:"이미 사용 중인 아이디입니다."});
 try{res.json({user:await one("UPDATE users SET username=$1 WHERE id=$2 RETURNING id,name,email,username,role,active",[username,req.session.userId])})}
 catch(e){res.status(409).json({error:"이미 사용 중인 아이디입니다."})}
});
app.get("/api/sites",auth,async(req,res)=>{
 const u=await user(req);
 if(u.role==="ADMIN")return res.json(await q("SELECT * FROM sites ORDER BY id DESC"));
 return res.json(await q("SELECT s.* FROM sites s JOIN memberships m ON m.site_id=s.id WHERE m.user_id=$1 ORDER BY s.id DESC",[u.id]));
});

app.get("/api/dashboard",auth,async(req,res)=>{
 const sid=Number(req.query.site_id);if(!(await can(req,sid)))return res.status(403).json({error:"현장 권한이 없습니다."});
 const [a,b,c,d]=await Promise.all([
   one("SELECT count(*)::int n FROM risks WHERE site_id=$1",[sid]),
   one("SELECT count(*)::int n FROM risks WHERE site_id=$1 AND level='높음'",[sid]),
   one("SELECT count(*)::int n FROM actions WHERE site_id=$1 AND status<>'DONE'",[sid]),
   one("SELECT count(*)::int n FROM tbms WHERE site_id=$1 AND tbm_date=CURRENT_DATE",[sid])
 ]);
 res.json({riskCount:a.n,highRiskCount:b.n,actionOpen:c.n,todayTbm:d.n});
});

// 최고관리자 전체 현장 집계. 일반 직원에게는 전체 현장 데이터가 노출되지 않습니다.
app.get("/api/overview",auth,async(req,res,next)=>{
 try{
  const u=await user(req);
  if(u.role!=="ADMIN")return res.status(403).json({error:"최고관리자만 전체 현황을 볼 수 있습니다."});
  const rows=await q(`SELECT s.id,s.name,s.status,
   (SELECT count(*)::int FROM risks r WHERE r.site_id=s.id) risk_count,
   (SELECT count(*)::int FROM risks r WHERE r.site_id=s.id AND r.level='높음') high_count,
   (SELECT count(*)::int FROM actions a WHERE a.site_id=s.id AND a.status<>'DONE') open_count,
   (SELECT count(*)::int FROM tbms t WHERE t.site_id=s.id AND t.tbm_date=CURRENT_DATE) today_tbm
   FROM sites s ORDER BY s.id DESC`);
  res.json({sites:rows,totals:rows.reduce((a,r)=>({riskCount:a.riskCount+r.risk_count,highRiskCount:a.highRiskCount+r.high_count,actionOpen:a.actionOpen+r.open_count,todayTbm:a.todayTbm+r.today_tbm}),{riskCount:0,highRiskCount:0,actionOpen:0,todayTbm:0})});
 }catch(e){next(e)}
});

// 현장별 또는 최고관리자의 전체 현장 기록 검색 (기간/유형/검색어)
app.get("/api/history",auth,async(req,res,next)=>{
 try{
  const u=await user(req),siteId=String(req.query.site_id||"");
  if(siteId!=="all" && (!/^\d+$/.test(siteId)||!(await can(req,Number(siteId)))))return res.status(403).json({error:"현장 권한이 없습니다."});
  if(siteId==="all"&&u.role!=="ADMIN")return res.status(403).json({error:"전체 현장 조회 권한이 없습니다."});
  const type=String(req.query.type||"all");if(!["all","risk","tbm"].includes(type))return res.status(400).json({error:"잘못된 기록 유형입니다."});
  const from=String(req.query.from||""),to=String(req.query.to||"");
  if((from&&!/^\d{4}-\d{2}-\d{2}$/.test(from))||(to&&!/^\d{4}-\d{2}-\d{2}$/.test(to)))return res.status(400).json({error:"날짜 형식이 잘못되었습니다."});
  const keyword=String(req.query.keyword||"").slice(0,100);
  const params=[siteId==="all"?null:Number(siteId),from||null,to||null,`%${keyword}%`];
  const sql=`SELECT * FROM (
   SELECT 'risk' kind,r.id,r.site_id,s.name site_name,r.risk_date record_date,r.work title,r.hazard detail,r.measure, r.area extra
   FROM risks r JOIN sites s ON s.id=r.site_id
   UNION ALL
   SELECT 'tbm' kind,t.id,t.site_id,s.name site_name,t.tbm_date record_date,t.work_name title,t.hazard detail,t.measure,t.team extra
   FROM tbms t JOIN sites s ON s.id=t.site_id
  ) h WHERE ($1::int IS NULL OR h.site_id=$1) AND ($2::date IS NULL OR h.record_date >= $2::date)
   AND ($3::date IS NULL OR h.record_date <= $3::date)
   AND (h.title ILIKE $4 OR h.detail ILIKE $4 OR h.extra ILIKE $4 OR h.site_name ILIKE $4)
   AND ($5::text='all' OR h.kind=$5) ORDER BY h.record_date DESC NULLS LAST,h.id DESC LIMIT 500`;
  res.json(await q(sql,[...params,type]));
 }catch(e){next(e)}
});

app.get("/api/settings",auth,async(req,res)=>{
 const sid=Number(req.query.site_id);if(!(await can(req,sid)))return res.status(403).json({error:"현장 권한이 없습니다."});
 let s=await one("SELECT * FROM settings WHERE site_id=$1",[sid]);
 if(!s){await pool.query("INSERT INTO settings(site_id) VALUES($1)",[sid]);s=await one("SELECT * FROM settings WHERE site_id=$1",[sid]);}
 res.json(s);
});
app.put("/api/settings",auth,async(req,res)=>{
 const sid=Number(req.body.site_id);if(!(await can(req,sid,["ADMIN","MANAGER"])))return res.status(403).json({error:"관리 권한이 없습니다."});
 await pool.query(`INSERT INTO settings(site_id,frequency_labels,severity_labels,low_max,medium_max)
 VALUES($1,$2,$3,$4,$5)
 ON CONFLICT(site_id) DO UPDATE SET frequency_labels=EXCLUDED.frequency_labels,severity_labels=EXCLUDED.severity_labels,low_max=EXCLUDED.low_max,medium_max=EXCLUDED.medium_max`,
 [sid,JSON.stringify(req.body.frequency_labels),JSON.stringify(req.body.severity_labels),Number(req.body.low_max),Number(req.body.medium_max)]);
 res.json(await one("SELECT * FROM settings WHERE site_id=$1",[sid]));
});

app.get("/api/risks",auth,async(req,res)=>{
 const sid=Number(req.query.site_id);if(!(await can(req,sid)))return res.status(403).json({error:"현장 권한이 없습니다."});
 res.json(await q("SELECT r.*,u.name author_name FROM risks r LEFT JOIN users u ON u.id=r.author_id WHERE r.site_id=$1 ORDER BY r.id DESC",[sid]));
});
app.post("/api/risks",auth,async(req,res)=>{
 const sid=Number(req.body.site_id);if(!(await can(req,sid)))return res.status(403).json({error:"현장 권한이 없습니다."});
 const s=await one("SELECT * FROM settings WHERE site_id=$1",[sid])||{low_max:3,medium_max:5};
 const r=riskCalc(req.body.frequency,req.body.severity,s),u=await user(req);
 const x=await one(`INSERT INTO risks(site_id,risk_date,area,work,hazard,frequency,severity,score,level,measure,author_id)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
 [sid,req.body.date||null,req.body.area,req.body.work,req.body.hazard,r.frequency,r.severity,r.score,r.level,req.body.measure,u.id]);
 res.json(x);
});

// 비공개 R2 사진: 업로드 및 열람 시 반드시 로그인과 현장 권한 검사
async function photoRecord(type,id){
 if(!["risk","tbm","action"].includes(type)||!Number.isSafeInteger(Number(id))||Number(id)<1)return null;
 return one(`SELECT id,site_id FROM ${({risk:"risks",tbm:"tbms",action:"actions"})[type]} WHERE id=$1`,[id]);
}
app.get("/api/photos/status",auth,(req,res)=>res.json({configured:r2Ready()}));
app.get("/api/photos",auth,async(req,res,next)=>{try{
 const record=await photoRecord(req.query.type,req.query.id);
 if(!record||!(await can(req,record.site_id)))return res.status(404).json({error:"기록을 찾을 수 없습니다."});
 res.json(await q("SELECT id,original_name,mime_type,byte_size,created_at,photo_stage FROM record_photos WHERE record_type=$1 AND record_id=$2 ORDER BY id",[req.query.type,record.id]));
}catch(e){next(e)}});
app.post("/api/photos",auth,(req,res,next)=>photoUpload.array("photos",5)(req,res,e=>e?res.status(400).json({error:e.message}):next()),async(req,res,next)=>{try{
 const type=String(req.body.type||""),record=await photoRecord(type,req.body.id);
 const stage=type==="action"&&req.body.stage==="before"?"before":type==="action"&&req.body.stage==="after"?"after":"general";
 if(!record||!(await can(req,record.site_id)))return res.status(404).json({error:"기록을 찾을 수 없습니다."});
 if(!r2Ready())return res.status(503).json({error:"사진 저장소가 연결되지 않았습니다. Render 환경변수에 R2 정보를 설정하세요."});
 if(!req.files?.length)return res.status(400).json({error:"JPG, PNG, WEBP 사진을 선택하세요. (한 번에 최대 5장, 장당 8MB)"});
 const uploaded=[];
 for(const f of req.files){
  // 확장자보다 MIME과 파일 시그니처를 함께 검사
  const b=f.buffer,valid=f.mimetype==="image/jpeg"&&b[0]===255&&b[1]===216&&b[2]===255||f.mimetype==="image/png"&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||f.mimetype==="image/webp"&&b.toString("ascii",0,4)==="RIFF"&&b.toString("ascii",8,12)==="WEBP";
  if(!valid)continue;
  const ext={"image/jpeg":"jpg","image/png":"png","image/webp":"webp"}[f.mimetype];
  const key=`sites/${record.site_id}/${type}/${record.id}/${crypto.randomUUID()}.${ext}`;
  await r2().send(new PutObjectCommand({Bucket:bucket(),Key:key,Body:b,ContentType:f.mimetype}));
  const row=await one("INSERT INTO record_photos(site_id,record_type,record_id,object_key,original_name,mime_type,byte_size,uploaded_by,photo_stage) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id",[record.site_id,type,record.id,key,path.basename(f.originalname).slice(0,180),f.mimetype,b.length,req.session.userId,stage]);uploaded.push(row.id);
 }
 if(!uploaded.length)return res.status(400).json({error:"올바른 이미지 파일이 아닙니다."});
 res.json({ok:true,ids:uploaded});
}catch(e){next(e)}});
app.get("/api/photos/:id/view",auth,async(req,res,next)=>{try{
 const f=await one("SELECT * FROM record_photos WHERE id=$1",[req.params.id]);
 if(!f||!(await can(req,f.site_id)))return res.status(404).json({error:"사진을 찾을 수 없습니다."});
 if(!r2Ready())return res.status(503).json({error:"사진 저장소가 연결되지 않았습니다."});
 const obj=await r2().send(new GetObjectCommand({Bucket:bucket(),Key:f.object_key}));
 res.set({"Content-Type":f.mime_type,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Content-Disposition":`inline; filename="photo.${f.mime_type.split('/')[1]}"`});
 obj.Body.pipe(res);
}catch(e){next(e)}});
app.get("/api/photos/:id/download",auth,async(req,res,next)=>{try{
 const f=await one("SELECT * FROM record_photos WHERE id=$1",[req.params.id]);
 if(!f||!(await can(req,f.site_id)))return res.status(404).json({error:"사진을 찾을 수 없습니다."});
 if(!r2Ready())return res.status(503).json({error:"사진 저장소 연결이 필요합니다."});
 const obj=await r2().send(new GetObjectCommand({Bucket:bucket(),Key:f.object_key}));
 const name=encodeURIComponent(f.original_name.replace(/[\r\n]/g,""));
 res.set({"Content-Type":f.mime_type,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Content-Disposition":`attachment; filename="photo"; filename*=UTF-8''${name}`});
 obj.Body.pipe(res);
}catch(e){next(e)}});
app.get("/api/photo-library",auth,async(req,res,next)=>{try{
 const sid=Number(req.query.site_id),all=req.query.site_id==="all";
 if(all&&(await user(req)).role!=="ADMIN")return res.status(403).json({error:"전체 현장은 최고관리자만 조회할 수 있습니다."});
 if(!all&&!(await can(req,sid)))return res.status(403).json({error:"현장 권한이 없습니다."});
 const from=String(req.query.from||""),to=String(req.query.to||"");
 const type=String(req.query.type||"all");
 const params=[];let where="WHERE 1=1";
 if(!all){params.push(sid);where+=` AND p.site_id=$${params.length}`}
 if(from){params.push(from);where+=` AND p.created_at::date >= $${params.length}::date`}
 if(to){params.push(to);where+=` AND p.created_at::date <= $${params.length}::date`}
 if(type!=="all"){if(!["risk","tbm","action","custom"].includes(type))return res.status(400).json({error:"사진 유형 오류"});if(type!=="custom"){params.push(type);where+=` AND p.record_type=$${params.length}`}}
 const regular=type==="custom"?[]:await q(`SELECT p.id,p.record_type,p.record_id,p.original_name,p.mime_type,p.byte_size,p.created_at,p.photo_stage,s.name site_name,p.site_id FROM record_photos p JOIN sites s ON s.id=p.site_id ${where} ORDER BY p.created_at DESC,p.id DESC LIMIT 500`,params);
 const customParams=[];let cw="WHERE 1=1";
 if(!all){customParams.push(sid);cw+=` AND r.site_id=$${customParams.length}`}
 if(from){customParams.push(from);cw+=` AND p.created_at::date >= $${customParams.length}::date`}
 if(to){customParams.push(to);cw+=` AND p.created_at::date <= $${customParams.length}::date`}
 const custom=type!=="all"&&type!=="custom"?[]:await q(`SELECT p.id,'custom' record_type,r.id record_id,p.original_name,p.mime_type,p.byte_size,p.created_at,'general' photo_stage,s.name site_name,r.site_id FROM custom_record_photos p JOIN custom_records r ON r.id=p.record_id JOIN sites s ON s.id=r.site_id ${cw} ORDER BY p.created_at DESC,p.id DESC LIMIT 500`,customParams);
 res.json([...regular,...custom].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,500));
}catch(e){next(e)}});
app.delete("/api/photos/:id",auth,async(req,res,next)=>{try{
 const f=await one("SELECT * FROM record_photos WHERE id=$1",[req.params.id]);
 if(!f||!(await can(req,f.site_id,["ADMIN","MANAGER"])))return res.status(403).json({error:"사진 삭제 권한이 없습니다."});
 if(!r2Ready())return res.status(503).json({error:"사진 저장소가 연결되지 않았습니다."});
 await r2().send(new DeleteObjectCommand({Bucket:bucket(),Key:f.object_key}));
 await pool.query("DELETE FROM record_photos WHERE id=$1",[f.id]);res.json({ok:true});
}catch(e){next(e)}});

app.get("/api/templates",auth,async(req,res)=>{
 const sid=Number(req.query.site_id);if(!(await can(req,sid)))return res.status(403).json({error:"현장 권한이 없습니다."});
 res.json(await q("SELECT * FROM templates WHERE site_id=$1 ORDER BY id DESC",[sid]));
});
app.post("/api/templates",auth,async(req,res)=>{
 const sid=Number(req.body.site_id);if(!(await can(req,sid)))return res.status(403).json({error:"현장 권한이 없습니다."});
 const s=await one("SELECT * FROM settings WHERE site_id=$1",[sid])||{low_max:3,medium_max:5},r=riskCalc(req.body.frequency,req.body.severity,s);
 const x=await one(`INSERT INTO templates(site_id,name,area,work,hazard,frequency,severity,score,level,measure)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
 [sid,req.body.name,req.body.area,req.body.work,req.body.hazard,r.frequency,r.severity,r.score,r.level,req.body.measure]);
 res.json(x);
});

app.get("/api/actions",auth,async(req,res)=>{
 const sid=Number(req.query.site_id);if(!(await can(req,sid)))return res.status(403).json({error:"현장 권한이 없습니다."});
 res.json(await q("SELECT * FROM actions WHERE site_id=$1 ORDER BY due_date NULLS LAST,id DESC",[sid]));
});
app.post("/api/actions",auth,async(req,res)=>{
 const sid=Number(req.body.site_id);if(!(await can(req,sid)))return res.status(403).json({error:"현장 권한이 없습니다."});
 res.json(await one(`INSERT INTO actions(site_id,risk_id,item,manager,due_date) VALUES($1,$2,$3,$4,$5) RETURNING *`,
 [sid,req.body.risk_id||null,req.body.item,req.body.manager,req.body.due_date||null]));
});
app.patch("/api/actions/:id",auth,async(req,res)=>{
 const a=await one("SELECT * FROM actions WHERE id=$1",[req.params.id]);if(!a||!(await can(req,a.site_id)))return res.status(404).json({error:"조치사항을 찾을 수 없습니다."});
 const status=req.body.status||a.status;
 res.json(await one("UPDATE actions SET item=$1,manager=$2,due_date=$3,status=$4,completed_at=$5 WHERE id=$6 RETURNING *",
 [req.body.item??a.item,req.body.manager??a.manager,req.body.due_date??a.due_date,status,status==="DONE"?new Date():null,a.id]));
});

app.get("/api/tbms",auth,async(req,res)=>{
 const sid=Number(req.query.site_id);if(!(await can(req,sid)))return res.status(403).json({error:"현장 권한이 없습니다."});
 res.json(await q("SELECT t.*,r.work risk_work FROM tbms t LEFT JOIN risks r ON r.id=t.risk_id WHERE t.site_id=$1 ORDER BY t.id DESC",[sid]));
});
app.post("/api/tbms",auth,async(req,res)=>{
 const sid=Number(req.body.site_id);if(!(await can(req,sid)))return res.status(403).json({error:"현장 권한이 없습니다."});
 const u=await user(req);
 res.json(await one(`INSERT INTO tbms(site_id,tbm_date,team,work_name,people,hazard,measure,risk_id,created_by)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
 [sid,req.body.tbm_date||null,req.body.team,req.body.work_name,Number(req.body.people||0),req.body.hazard,req.body.measure,req.body.risk_id||null,u.id]));
});

app.post("/api/sites",auth,async(req,res)=>{
 const u=await user(req);if(u.role!=="ADMIN")return res.status(403).json({error:"최고관리자만 현장을 만들 수 있습니다."});
 const s=await one("INSERT INTO sites(name,address,start_date,end_date,status) VALUES($1,$2,$3,$4,$5) RETURNING *",
 [req.body.name,req.body.address||"",req.body.start_date||null,req.body.end_date||null,req.body.status||"진행중"]);
 await pool.query("INSERT INTO memberships(user_id,site_id,role) VALUES($1,$2,'ADMIN')",[u.id,s.id]);
 await pool.query("INSERT INTO settings(site_id) VALUES($1)",[s.id]);
 res.json(s);
});
app.patch("/api/sites/:id",auth,async(req,res)=>{
 const u=await user(req);if(u.role!=="ADMIN")return res.status(403).json({error:"관리자만 변경할 수 있습니다."});
 res.json(await one("UPDATE sites SET name=$1,address=$2,start_date=$3,end_date=$4,status=$5 WHERE id=$6 RETURNING *",
 [req.body.name,req.body.address,req.body.start_date||null,req.body.end_date||null,req.body.status,req.params.id]));
});

app.get("/api/users",auth,async(req,res)=>{
 const u=await user(req);if(u.role!=="ADMIN")return res.status(403).json({error:"관리자만 볼 수 있습니다."});
 res.json(await q(`SELECT u.id,u.name,u.email,u.username,u.role,u.active,COALESCE(json_agg(json_build_object('site_id',m.site_id,'site_name',s.name,'site_role',m.role)) FILTER(WHERE m.site_id IS NOT NULL),'[]') sites
 FROM users u LEFT JOIN memberships m ON m.user_id=u.id LEFT JOIN sites s ON s.id=m.site_id GROUP BY u.id ORDER BY u.id DESC`));
});
const VALID_ROLES=new Set(["ADMIN","MANAGER","USER"]);
const cleanEmail=v=>String(v||"").trim().toLowerCase();
const validEmail=v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)&&v.length<=254;
const cleanUsername=v=>String(v||"").trim().toLowerCase();
const validUsername=v=>v===""||/^[a-z][a-z0-9._-]{3,29}$/.test(v);
const validPassword=v=>typeof v==="string"&&v.length>=10&&v.length<=128;
const adminOnly=async(req,res)=>{const u=await user(req);if(u?.role!=="ADMIN"){res.status(403).json({error:"최고관리자만 관리할 수 있습니다."});return false}return true};
const adminCount=async()=>Number((await one("SELECT count(*)::int n FROM users WHERE role='ADMIN' AND active=true")).n);
app.post("/api/users",auth,async(req,res)=>{
 if(!(await adminOnly(req,res)))return;
 const name=String(req.body.name||"").trim(),email=cleanEmail(req.body.email),username=cleanUsername(req.body.username),password=req.body.password,role=req.body.role||"USER";
 if(!name||name.length>100||!validEmail(email)||!validUsername(username)||!validPassword(password)||!VALID_ROLES.has(role))return res.status(400).json({error:"이름, 이메일, 권한과 10자 이상 비밀번호를 확인하세요."});
 const client=await pool.connect();
 try{
  await client.query("BEGIN");
  const conflict=(await client.query("SELECT id FROM users WHERE lower(email)=ANY($1::text[]) OR lower(username)=ANY($1::text[])",[[email,...(username?[username]:[])]] )).rows[0];
  if(conflict)throw Error("이미 사용 중인 아이디 또는 이메일입니다.");
  const ph=await bcrypt.hash(password,12);
  const nu=(await client.query("INSERT INTO users(name,email,username,password_hash,role) VALUES($1,$2,$3,$4,$5) RETURNING id,name,email,username,role,active",[name,email,username||null,ph,role])).rows[0];
  if(req.body.site_id){
   const site=(await client.query("SELECT id FROM sites WHERE id=$1",[req.body.site_id])).rows[0];
   if(!site)throw Error("현장을 찾을 수 없습니다.");
   const sr=req.body.site_role|| (role==="ADMIN"?"ADMIN":role);
   if(!VALID_ROLES.has(sr))throw Error("현장 권한이 올바르지 않습니다.");
   await client.query("INSERT INTO memberships(user_id,site_id,role) VALUES($1,$2,$3)",[nu.id,site.id,sr]);
  }
  await client.query("COMMIT");res.status(201).json(nu);
 }catch(e){await client.query("ROLLBACK");res.status(400).json({error:e.code==="23505"?"이미 등록된 이메일입니다.":e.message})}finally{client.release()}
});
app.patch("/api/users/:id",auth,async(req,res)=>{
 if(!(await adminOnly(req,res)))return;
 const target=await one("SELECT id,role,active FROM users WHERE id=$1",[req.params.id]);
 if(!target)return res.status(404).json({error:"사용자를 찾을 수 없습니다."});
 const name=String(req.body.name||"").trim(),email=cleanEmail(req.body.email),username=cleanUsername(req.body.username),role=req.body.role;
 if(!name||name.length>100||!validEmail(email)||!validUsername(username)||!VALID_ROLES.has(role))return res.status(400).json({error:"입력 내용을 확인하세요."});
 if(target.role==="ADMIN"&&target.active&&role!=="ADMIN"&&(await adminCount())<=1)return res.status(400).json({error:"마지막 활성 최고관리자의 권한은 변경할 수 없습니다."});
 try{
  const identifiers=[email,...(username?[username]:[])];
  const conflict=await one("SELECT id FROM users WHERE id<>$1 AND (lower(email)=ANY($2::text[]) OR lower(username)=ANY($2::text[])) LIMIT 1",[target.id,identifiers]);
  if(conflict)return res.status(409).json({error:"이미 사용 중인 아이디 또는 이메일입니다."});
  res.json(await one("UPDATE users SET name=$1,email=$2,username=$3,role=$4 WHERE id=$5 RETURNING id,name,email,username,role,active",[name,email,username||null,role,target.id]));
 }catch(e){res.status(400).json({error:e.code==="23505"?"이미 사용 중인 아이디 또는 이메일입니다.":"수정에 실패했습니다."})}
});
app.patch("/api/users/:id/status",auth,async(req,res)=>{
 if(!(await adminOnly(req,res)))return;
 const target=await one("SELECT id,role,active FROM users WHERE id=$1",[req.params.id]);
 if(!target)return res.status(404).json({error:"사용자를 찾을 수 없습니다."});
 if(typeof req.body.active!=="boolean")return res.status(400).json({error:"상태 값이 올바르지 않습니다."});
 if(Number(target.id)===Number(req.session.userId)&&!req.body.active)return res.status(400).json({error:"자기 계정은 비활성화할 수 없습니다."});
 if(target.role==="ADMIN"&&target.active&&!req.body.active&&(await adminCount())<=1)return res.status(400).json({error:"마지막 활성 최고관리자를 비활성화할 수 없습니다."});
 res.json(await one("UPDATE users SET active=$1,session_version=session_version+1 WHERE id=$2 RETURNING id,active",[req.body.active,target.id]));
});
app.post("/api/users/:id/reset-password",auth,async(req,res)=>{
 if(!(await adminOnly(req,res)))return;
 if(!validPassword(req.body.password))return res.status(400).json({error:"새 비밀번호는 10자 이상이어야 합니다."});
 const ph=await bcrypt.hash(req.body.password,12);
 const target=await one("UPDATE users SET password_hash=$1,session_version=session_version+1 WHERE id=$2 RETURNING id",[ph,req.params.id]);
 if(!target)return res.status(404).json({error:"사용자를 찾을 수 없습니다."});
 res.json({ok:true});
});
app.post("/api/change-password",auth,async(req,res)=>{
 const u=await one("SELECT password_hash FROM users WHERE id=$1",[req.session.userId]);
 if(!u||!(await bcrypt.compare(String(req.body.current_password||""),u.password_hash)))return res.status(400).json({error:"현재 비밀번호가 올바르지 않습니다."});
 if(!validPassword(req.body.new_password))return res.status(400).json({error:"새 비밀번호는 10자 이상이어야 합니다."});
 if(req.body.current_password===req.body.new_password)return res.status(400).json({error:"현재 비밀번호와 다른 비밀번호를 입력하세요."});
 const ph=await bcrypt.hash(req.body.new_password,12);
 const updated=await one("UPDATE users SET password_hash=$1,session_version=session_version+1 WHERE id=$2 RETURNING session_version",[ph,req.session.userId]);
 req.session.sessionVersion=updated.session_version;
 res.json({ok:true});
});
app.post("/api/users/:id/sites",auth,async(req,res)=>{
 if(!(await adminOnly(req,res)))return;
 const role=req.body.role||"USER";
 if(!VALID_ROLES.has(role))return res.status(400).json({error:"현장 권한이 올바르지 않습니다."});
 const u=await one("SELECT id FROM users WHERE id=$1",[req.params.id]),site=await one("SELECT id FROM sites WHERE id=$1",[req.body.site_id]);
 if(!u||!site)return res.status(404).json({error:"사용자 또는 현장을 찾을 수 없습니다."});
 await pool.query("INSERT INTO memberships(user_id,site_id,role) VALUES($1,$2,$3) ON CONFLICT(user_id,site_id) DO UPDATE SET role=EXCLUDED.role",[u.id,site.id,role]);
 res.json({ok:true});
});
app.delete("/api/users/:id/sites/:siteId",auth,async(req,res)=>{
 if(!(await adminOnly(req,res)))return;
 await pool.query("DELETE FROM memberships WHERE user_id=$1 AND site_id=$2",[req.params.id,req.params.siteId]);
 res.json({ok:true});
});

// 관리자가 사이트 안에서 직접 양식/메뉴를 구성합니다. 기존 양식 및 기록은 숨김 처리로 보존합니다.
app.get("/api/custom/forms",auth,async(req,res,next)=>{try{
 const forms=await q("SELECT * FROM custom_forms ORDER BY sort_order,id");
 const fields=await q("SELECT * FROM custom_fields ORDER BY sort_order,id");
 const admin=(await user(req)).role==="ADMIN";res.json(forms.filter(f=>(f.active||admin)&&(!f.site_id||admin||Number(req.query.site_id)===f.site_id)).map(f=>({...f,fields:fields.filter(x=>x.form_id===f.id)})));
}catch(e){next(e)}});
app.post("/api/custom/forms",auth,async(req,res,next)=>{try{
 if((await user(req)).role!=="ADMIN")return res.status(403).json({error:"최고관리자만 변경할 수 있습니다."});
 const title=String(req.body.title||"").trim().slice(0,100);if(!title)return res.status(400).json({error:"메뉴 이름을 입력하세요."});
 res.json(await one("INSERT INTO custom_forms(title,description,site_id,sort_order) VALUES($1,$2,$3,COALESCE((SELECT MAX(sort_order)+10 FROM custom_forms),10)) RETURNING *",[title,String(req.body.description||"").slice(0,500),req.body.site_id?Number(req.body.site_id):null]));
}catch(e){next(e)}});
app.patch("/api/custom/forms/:id",auth,async(req,res,next)=>{try{
 if((await user(req)).role!=="ADMIN")return res.status(403).json({error:"관리자만 변경할 수 있습니다."});
 const f=await one("SELECT * FROM custom_forms WHERE id=$1",[req.params.id]);if(!f)return res.status(404).json({error:"메뉴가 없습니다."});
 res.json(await one("UPDATE custom_forms SET title=$1,description=$2,active=$3,sort_order=$4 WHERE id=$5 RETURNING *",[String(req.body.title??f.title).trim().slice(0,100),String(req.body.description??f.description).slice(0,500),req.body.active??f.active,Number(req.body.sort_order??f.sort_order),f.id]));
}catch(e){next(e)}});
app.post("/api/custom/forms/:id/fields",auth,async(req,res,next)=>{try{
 if((await user(req)).role!=="ADMIN")return res.status(403).json({error:"관리자만 변경할 수 있습니다."});
 const form=await one("SELECT id FROM custom_forms WHERE id=$1",[req.params.id]);if(!form)return res.status(404).json({error:"메뉴가 없습니다."});
 const label=String(req.body.label||"").trim().slice(0,100),type=String(req.body.field_type||"text");
 if(!label||!["text","textarea","date","number","select","photo"].includes(type))return res.status(400).json({error:"입력 항목을 확인하세요."});
 const opts=Array.isArray(req.body.options)?req.body.options.map(x=>String(x).slice(0,100)).slice(0,30):[];
 res.json(await one("INSERT INTO custom_fields(form_id,label,field_type,options,required,sort_order) VALUES($1,$2,$3,$4,$5,COALESCE((SELECT MAX(sort_order)+10 FROM custom_fields WHERE form_id=$1),10)) RETURNING *",[form.id,label,type,JSON.stringify(opts),Boolean(req.body.required)]));
}catch(e){next(e)}});
app.patch("/api/custom/fields/:id",auth,async(req,res,next)=>{try{
 if((await user(req)).role!=="ADMIN")return res.status(403).json({error:"관리자만 변경할 수 있습니다."});
 const f=await one("SELECT * FROM custom_fields WHERE id=$1",[req.params.id]);if(!f)return res.status(404).json({error:"항목이 없습니다."});
 const type=String(req.body.field_type??f.field_type);if(!["text","textarea","date","number","select","photo"].includes(type))return res.status(400).json({error:"항목 종류 오류"});
 res.json(await one("UPDATE custom_fields SET label=$1,field_type=$2,options=$3,required=$4,active=$5,sort_order=$6 WHERE id=$7 RETURNING *",[String(req.body.label??f.label).slice(0,100),type,JSON.stringify(req.body.options??f.options),req.body.required??f.required,req.body.active??f.active,Number(req.body.sort_order??f.sort_order),f.id]));
}catch(e){next(e)}});
app.get("/api/custom/records",auth,async(req,res,next)=>{try{
 const fid=Number(req.query.form_id),sid=Number(req.query.site_id);
 if(!(await can(req,sid)))return res.status(403).json({error:"현장 권한이 없습니다."});
 res.json(await q("SELECT r.*,u.name author FROM custom_records r LEFT JOIN users u ON u.id=r.created_by WHERE r.form_id=$1 AND r.site_id=$2 AND r.deleted_at IS NULL ORDER BY r.record_date DESC,r.id DESC LIMIT 500",[fid,sid]));
}catch(e){next(e)}});
app.post("/api/custom/records",auth,async(req,res,next)=>{try{
 const fid=Number(req.body.form_id),sid=Number(req.body.site_id);
 if(!(await can(req,sid)))return res.status(403).json({error:"현장 권한이 없습니다."});
 const form=await one("SELECT * FROM custom_forms WHERE id=$1 AND active=true",[fid]);if(!form||form.site_id&&form.site_id!==sid)return res.status(404).json({error:"이 현장에서 사용할 수 없는 메뉴입니다."});
 const fields=await q("SELECT * FROM custom_fields WHERE form_id=$1 AND active=true",[fid]);const incoming=req.body.values||{},values={};
 for(const f of fields){if(f.field_type==="photo")continue;const v=String(incoming[f.id]??"").slice(0,5000);if(f.required&&!v.trim())return res.status(400).json({error:`${f.label}: 필수 입력 항목입니다.`});if(f.field_type==="select"&&v&&!f.options.includes(v))return res.status(400).json({error:`${f.label}: 선택값 오류`});values[f.id]=v}
 res.json(await one("INSERT INTO custom_records(form_id,site_id,record_date,form_data,created_by) VALUES($1,$2,$3,$4,$5) RETURNING *",[fid,sid,req.body.record_date||new Date().toISOString().slice(0,10),JSON.stringify(values),req.session.userId]));
}catch(e){next(e)}});
// 사용자 지정 양식의 사진 필드는 기존 R2 비공개 버킷을 공유합니다.
app.post("/api/custom/records/:id/photos/:fieldId",auth,(req,res,next)=>photoUpload.array("photos",5)(req,res,e=>e?res.status(400).json({error:e.message}):next()),async(req,res,next)=>{try{
 const rec=await one("SELECT * FROM custom_records WHERE id=$1",[req.params.id]);if(!rec||!(await can(req,rec.site_id)))return res.status(404).json({error:"기록이 없습니다."});
 const field=await one("SELECT * FROM custom_fields WHERE id=$1 AND form_id=$2 AND active=true AND field_type='photo'",[req.params.fieldId,rec.form_id]);if(!field)return res.status(400).json({error:"사진 항목이 아닙니다."});
 if(!r2Ready())return res.status(503).json({error:"R2 연결이 필요합니다."});
 let count=0;for(const f of req.files||[]){const b=f.buffer;const valid=f.mimetype==="image/jpeg"&&b[0]===255&&b[1]===216&&b[2]===255||f.mimetype==="image/png"&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||f.mimetype==="image/webp"&&b.toString("ascii",0,4)==="RIFF"&&b.toString("ascii",8,12)==="WEBP";if(!valid)continue;
 const key=`sites/${rec.site_id}/custom/${rec.form_id}/${rec.id}/${crypto.randomUUID()}`;
 await r2().send(new PutObjectCommand({Bucket:bucket(),Key:key,Body:b,ContentType:f.mimetype}));
 await pool.query("INSERT INTO custom_record_photos(record_id,field_id,object_key,original_name,mime_type,byte_size) VALUES($1,$2,$3,$4,$5,$6)",[rec.id,field.id,key,path.basename(f.originalname).slice(0,180),f.mimetype,b.length]);count++}
 res.json({ok:true,count});
}catch(e){next(e)}});
app.get("/api/custom/records/:id/photos",auth,async(req,res,next)=>{try{
 const rec=await one("SELECT * FROM custom_records WHERE id=$1",[req.params.id]);if(!rec||!(await can(req,rec.site_id)))return res.status(404).json({error:"기록이 없습니다."});
 res.json(await q("SELECT id,field_id,original_name,mime_type,byte_size,created_at FROM custom_record_photos WHERE record_id=$1 ORDER BY id",[rec.id]));
}catch(e){next(e)}});
app.get("/api/custom/photos/:id/:mode",auth,async(req,res,next)=>{try{
 if(!["view","download"].includes(req.params.mode))return res.status(404).end();
 const f=await one("SELECT p.*,r.site_id FROM custom_record_photos p JOIN custom_records r ON r.id=p.record_id WHERE p.id=$1",[req.params.id]);
 if(!f||!(await can(req,f.site_id)))return res.status(404).json({error:"사진을 찾을 수 없습니다."});
 if(!r2Ready())return res.status(503).json({error:"R2 연결이 필요합니다."});
 const obj=await r2().send(new GetObjectCommand({Bucket:bucket(),Key:f.object_key}));
 res.set({"Content-Type":f.mime_type,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Content-Disposition":req.params.mode==="download"?`attachment; filename="photo"; filename*=UTF-8''${encodeURIComponent(f.original_name)}`:"inline"});obj.Body.pipe(res);
}catch(e){next(e)}});
// V4: 기록 보관/복원, 관리자 감사, 현장별 메뉴, 승인 이력, 공지 및 CSV
const audit=async(req,action,type,id,site,details={})=>pool.query("INSERT INTO admin_audit(actor_id,site_id,action,target_type,target_id,details) VALUES($1,$2,$3,$4,$5,$6)",[req.session.userId,site||null,action,type,id||null,JSON.stringify(details)]);
app.post("/api/admin/forms/:id/clone",auth,async(req,res,next)=>{try{
 if(!(await adminOnly(req,res)))return;
 const f=await one("SELECT * FROM custom_forms WHERE id=$1",[req.params.id]);if(!f)return res.status(404).json({error:"양식이 없습니다."});
 const sid=req.body.site_id===undefined?f.site_id:(req.body.site_id?Number(req.body.site_id):null);
 const client=await pool.connect();try{await client.query('BEGIN');const n=(await client.query("INSERT INTO custom_forms(title,description,icon,active,sort_order,site_id) VALUES($1,$2,$3,true,$4,$5) RETURNING *",[String(req.body.title||f.title+' (복제)').slice(0,100),f.description,f.icon,f.sort_order+1,sid])).rows[0];await client.query("INSERT INTO custom_fields(form_id,label,field_type,options,required,active,sort_order) SELECT $1,label,field_type,options,required,active,sort_order FROM custom_fields WHERE form_id=$2",[n.id,f.id]);await client.query('COMMIT');await audit(req,'FORM_CLONE','form',n.id,sid,{source_id:f.id});res.json(n)}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
}catch(e){next(e)}});
app.patch("/api/admin/forms/:id/scope",auth,async(req,res,next)=>{try{if(!(await adminOnly(req,res)))return;const sid=req.body.site_id?Number(req.body.site_id):null;if(sid&&!(await one('SELECT id FROM sites WHERE id=$1',[sid])))return res.status(400).json({error:'현장을 찾을 수 없습니다.'});const f=await one('UPDATE custom_forms SET site_id=$1 WHERE id=$2 RETURNING *',[sid,req.params.id]);if(!f)return res.status(404).json({error:'양식 없음'});await audit(req,'FORM_SCOPE','form',f.id,sid);res.json(f)}catch(e){next(e)}});
app.patch("/api/admin/custom-records/:id",auth,async(req,res,next)=>{try{if(!(await adminOnly(req,res)))return;const r=await one('SELECT * FROM custom_records WHERE id=$1 AND deleted_at IS NULL',[req.params.id]);if(!r)return res.status(404).json({error:'기록 없음'});const values=req.body.values;if(!values||typeof values!=='object'||Array.isArray(values))return res.status(400).json({error:'수정 내용을 확인하세요'});const fields=await q('SELECT * FROM custom_fields WHERE form_id=$1',[r.form_id]);const data={...r.form_data};for(const [key,value] of Object.entries(values)){const f=fields.find(x=>String(x.id)===key);if(!f||f.field_type==='photo')return res.status(400).json({error:'허용되지 않는 항목'});data[key]=String(value??'').slice(0,5000)}const updated=await one('UPDATE custom_records SET form_data=$1 WHERE id=$2 RETURNING *',[JSON.stringify(data),r.id]);await audit(req,'RECORD_EDIT','custom',r.id,r.site_id,{before:r.form_data,after:data});res.json(updated)}catch(e){next(e)}});
app.delete("/api/admin/custom-records/:id",auth,async(req,res,next)=>{try{if(!(await adminOnly(req,res)))return;const r=await one('UPDATE custom_records SET deleted_at=now(),deleted_by=$1 WHERE id=$2 AND deleted_at IS NULL RETURNING id,site_id',[req.session.userId,req.params.id]);if(!r)return res.status(404).json({error:'기록 없음'});await audit(req,'RECORD_TRASH','custom',r.id,r.site_id);res.json({ok:true})}catch(e){next(e)}});
app.get("/api/admin/trash",auth,async(req,res,next)=>{try{if(!(await adminOnly(req,res)))return;res.json(await q('SELECT r.id,r.site_id,r.record_date,r.deleted_at,f.title form_title,s.name site_name FROM custom_records r JOIN custom_forms f ON f.id=r.form_id JOIN sites s ON s.id=r.site_id WHERE r.deleted_at IS NOT NULL ORDER BY r.deleted_at DESC LIMIT 200'))}catch(e){next(e)}});
app.post("/api/admin/trash/:id/restore",auth,async(req,res,next)=>{try{if(!(await adminOnly(req,res)))return;const r=await one('UPDATE custom_records SET deleted_at=NULL,deleted_by=NULL WHERE id=$1 AND deleted_at IS NOT NULL RETURNING id,site_id',[req.params.id]);if(!r)return res.status(404).json({error:'휴지통에 기록이 없습니다'});await audit(req,'RECORD_RESTORE','custom',r.id,r.site_id);res.json({ok:true})}catch(e){next(e)}});
app.get("/api/admin/audit",auth,async(req,res,next)=>{try{if(!(await adminOnly(req,res)))return;res.json(await q('SELECT a.id,a.created_at,a.action,a.target_type,a.target_id,a.site_id,u.name actor FROM admin_audit a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT 300'))}catch(e){next(e)}});
app.get("/api/approvals",auth,async(req,res,next)=>{try{const sid=Number(req.query.site_id);if(!(await can(req,sid)))return res.status(403).json({error:'현장 권한 없음'});res.json(await q('SELECT a.*,u.name actor FROM record_approvals a LEFT JOIN users u ON u.id=a.actor_id WHERE site_id=$1 ORDER BY a.id DESC LIMIT 200',[sid]))}catch(e){next(e)}});
app.post("/api/approvals",auth,async(req,res,next)=>{try{const sid=Number(req.body.site_id),u=await user(req);if(!(await can(req,sid))||!['ADMIN','MANAGER'].includes(u.role))return res.status(403).json({error:'승인 권한 없음'});const type=String(req.body.record_type),id=Number(req.body.record_id),status=String(req.body.status),step=Number(req.body.step||1);if(!['risk','tbm','action','custom'].includes(type)||!Number.isInteger(id)||id<1||!['PENDING','APPROVED','REJECTED'].includes(status)||!Number.isInteger(step)||step<1||step>20)return res.status(400).json({error:'결재 입력 오류'});const table={risk:'risks',tbm:'tbms',action:'actions',custom:'custom_records'}[type];if(!(await one(`SELECT id FROM ${table} WHERE id=$1 AND site_id=$2`,[id,sid])))return res.status(404).json({error:'해당 현장의 기록 없음'});const row=await one('INSERT INTO record_approvals(site_id,record_type,record_id,step,status,comment,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[sid,type,id,step,status,String(req.body.comment||'').slice(0,2000),u.id]);await audit(req,'APPROVAL_'+status,type,id,sid,{step});res.json(row)}catch(e){next(e)}});
app.get("/api/notices",auth,async(req,res,next)=>{try{const sid=Number(req.query.site_id);if(!(await can(req,sid)))return res.status(403).json({error:'현장 권한 없음'});res.json(await q('SELECT n.*,u.name author FROM site_notices n LEFT JOIN users u ON u.id=n.created_by WHERE n.active=true AND (n.site_id IS NULL OR n.site_id=$1) ORDER BY n.id DESC LIMIT 100',[sid]))}catch(e){next(e)}});
app.post("/api/admin/notices",auth,async(req,res,next)=>{try{if(!(await adminOnly(req,res)))return;const sid=req.body.site_id?Number(req.body.site_id):null,title=String(req.body.title||'').trim().slice(0,120),body=String(req.body.body||'').trim().slice(0,4000);if(!title||!body)return res.status(400).json({error:'제목과 내용을 입력하세요'});const n=await one('INSERT INTO site_notices(site_id,title,body,created_by) VALUES($1,$2,$3,$4) RETURNING *',[sid,title,body,req.session.userId]);await audit(req,'NOTICE_CREATE','notice',n.id,sid);res.json(n)}catch(e){next(e)}});
app.get("/api/admin/export/custom.csv",auth,async(req,res,next)=>{try{if(!(await adminOnly(req,res)))return;const sid=Number(req.query.site_id);if(!sid)return res.status(400).json({error:'현장을 선택하세요'});const rows=await q('SELECT r.id,r.record_date,f.title,u.name author,r.form_data FROM custom_records r JOIN custom_forms f ON f.id=r.form_id LEFT JOIN users u ON u.id=r.created_by WHERE r.site_id=$1 AND r.deleted_at IS NULL ORDER BY r.record_date DESC LIMIT 10000',[sid]);const csvCell=v=>'"'+String(v??'').replace(/"/g,'""').replace(/^[=+@-]/,String.fromCharCode(39)+'$&')+'"';const lines=[['ID','날짜','양식','작성자','내용'],...rows.map(r=>[r.id,String(r.record_date).slice(0,10),r.title,r.author,JSON.stringify(r.form_data)])];res.set({'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="custom-records.csv"'}).send('\uFEFF'+lines.map(row=>row.map(csvCell).join(',')).join('\r\n'))}catch(e){next(e)}});
app.use((req,res)=>{if(req.method==="GET")res.sendFile(path.join(__dirname,"public","index.html"));else res.status(404).json({error:"요청을 찾을 수 없습니다."})});
init().then(()=>app.listen(PORT,"0.0.0.0",()=>console.log(`Safety app running on ${PORT}`))).catch(e=>{console.error(e);process.exit(1)});
