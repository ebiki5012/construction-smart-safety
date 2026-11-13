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
 record_type TEXT NOT NULL CHECK(record_type IN ('risk','tbm')),
 record_id INT NOT NULL,object_key TEXT NOT NULL UNIQUE,
 original_name TEXT NOT NULL,mime_type TEXT NOT NULL,
 byte_size INT NOT NULL,uploaded_by INT REFERENCES users(id),created_at TIMESTAMPTZ DEFAULT now()
 );CREATE INDEX IF NOT EXISTS record_photos_lookup ON record_photos(record_type,record_id);`);
 await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0");
 const admin=await one("SELECT id FROM users WHERE email=$1",["admin@site.local"]);
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
async function user(req){return one("SELECT id,name,email,role,active FROM users WHERE id=$1",[req.session.userId])}
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
 const email=String(req.body.email||"").toLowerCase().trim(),password=String(req.body.password||"");
 const u=await one("SELECT * FROM users WHERE email=$1 AND active=true",[email]);
 if(!u||!(await bcrypt.compare(password,u.password_hash)))return res.status(401).json({error:"아이디 또는 비밀번호가 맞지 않습니다."});
 req.session.userId=u.id;req.session.sessionVersion=u.session_version;res.json({user:{id:u.id,name:u.name,email:u.email,role:u.role}});
});
app.post("/api/logout",auth,(req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.get("/api/me",auth,async(req,res)=>res.json({user:await user(req)}));
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
 if(!["risk","tbm"].includes(type)||!Number.isSafeInteger(Number(id))||Number(id)<1)return null;
 return one(`SELECT id,site_id FROM ${type==="risk"?"risks":"tbms"} WHERE id=$1`,[id]);
}
app.get("/api/photos/status",auth,(req,res)=>res.json({configured:r2Ready()}));
app.get("/api/photos",auth,async(req,res,next)=>{try{
 const record=await photoRecord(req.query.type,req.query.id);
 if(!record||!(await can(req,record.site_id)))return res.status(404).json({error:"기록을 찾을 수 없습니다."});
 res.json(await q("SELECT id,original_name,mime_type,byte_size,created_at FROM record_photos WHERE record_type=$1 AND record_id=$2 ORDER BY id",[req.query.type,record.id]));
}catch(e){next(e)}});
app.post("/api/photos",auth,(req,res,next)=>photoUpload.array("photos",5)(req,res,e=>e?res.status(400).json({error:e.message}):next()),async(req,res,next)=>{try{
 const type=String(req.body.type||""),record=await photoRecord(type,req.body.id);
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
  const row=await one("INSERT INTO record_photos(site_id,record_type,record_id,object_key,original_name,mime_type,byte_size,uploaded_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",[record.site_id,type,record.id,key,path.basename(f.originalname).slice(0,180),f.mimetype,b.length,req.session.userId]);uploaded.push(row.id);
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
 res.json(await q(`SELECT u.id,u.name,u.email,u.role,u.active,COALESCE(json_agg(json_build_object('site_id',m.site_id,'site_name',s.name,'site_role',m.role)) FILTER(WHERE m.site_id IS NOT NULL),'[]') sites
 FROM users u LEFT JOIN memberships m ON m.user_id=u.id LEFT JOIN sites s ON s.id=m.site_id GROUP BY u.id ORDER BY u.id DESC`));
});
const VALID_ROLES=new Set(["ADMIN","MANAGER","USER"]);
const cleanEmail=v=>String(v||"").trim().toLowerCase();
const validEmail=v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)&&v.length<=254;
const validPassword=v=>typeof v==="string"&&v.length>=10&&v.length<=128;
const adminOnly=async(req,res)=>{const u=await user(req);if(u?.role!=="ADMIN"){res.status(403).json({error:"최고관리자만 관리할 수 있습니다."});return false}return true};
const adminCount=async()=>Number((await one("SELECT count(*)::int n FROM users WHERE role='ADMIN' AND active=true")).n);
app.post("/api/users",auth,async(req,res)=>{
 if(!(await adminOnly(req,res)))return;
 const name=String(req.body.name||"").trim(),email=cleanEmail(req.body.email),password=req.body.password,role=req.body.role||"USER";
 if(!name||name.length>100||!validEmail(email)||!validPassword(password)||!VALID_ROLES.has(role))return res.status(400).json({error:"이름, 이메일, 권한과 10자 이상 비밀번호를 확인하세요."});
 const client=await pool.connect();
 try{
  await client.query("BEGIN");
  const ph=await bcrypt.hash(password,12);
  const nu=(await client.query("INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,$4) RETURNING id,name,email,role,active",[name,email,ph,role])).rows[0];
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
 const name=String(req.body.name||"").trim(),email=cleanEmail(req.body.email),role=req.body.role;
 if(!name||name.length>100||!validEmail(email)||!VALID_ROLES.has(role))return res.status(400).json({error:"입력 내용을 확인하세요."});
 if(target.role==="ADMIN"&&target.active&&role!=="ADMIN"&&(await adminCount())<=1)return res.status(400).json({error:"마지막 활성 최고관리자의 권한은 변경할 수 없습니다."});
 try{res.json(await one("UPDATE users SET name=$1,email=$2,role=$3 WHERE id=$4 RETURNING id,name,email,role,active",[name,email,role,target.id]))}
 catch(e){res.status(400).json({error:e.code==="23505"?"이미 등록된 이메일입니다.":"수정에 실패했습니다."})}
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

app.use((req,res)=>{if(req.method==="GET")res.sendFile(path.join(__dirname,"public","index.html"));else res.status(404).json({error:"요청을 찾을 수 없습니다."})});
init().then(()=>app.listen(PORT,"0.0.0.0",()=>console.log(`Safety app running on ${PORT}`))).catch(e=>{console.error(e);process.exit(1)});
