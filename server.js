const express=require("express");
const session=require("express-session");
const pgSession=require("connect-pg-simple")(session);
const {Pool}=require("pg");
const bcrypt=require("bcryptjs");
const path=require("path");

const app=express();
app.set("trust proxy", 1);
const PORT=process.env.PORT||3000;
const DATABASE_URL=process.env.DATABASE_URL;
if(!DATABASE_URL){
  console.error("DATABASE_URL is required. For local testing, set DATABASE_URL to a PostgreSQL connection string.");
  process.exit(1);
}
const pool=new Pool({connectionString:DATABASE_URL,ssl:process.env.NODE_ENV==="production"?{rejectUnauthorized:false}:false});
app.use(express.json({limit:"10mb"}));
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
function auth(req,res,next){if(!req.session.userId)return res.status(401).json({error:"로그인이 필요합니다."});next()}
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
 req.session.userId=u.id;res.json({user:{id:u.id,name:u.name,email:u.email,role:u.role}});
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
app.post("/api/users",auth,async(req,res)=>{
 const u=await user(req);if(u.role!=="ADMIN")return res.status(403).json({error:"관리자만 사용자를 만들 수 있습니다."});
 try{
  const ph=await bcrypt.hash(String(req.body.password||"12345678"),10);
  const nu=await one("INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,$4) RETURNING id,name,email,role,active",
  [req.body.name,req.body.email.toLowerCase(),ph,req.body.role||"USER"]);
  if(req.body.site_id)await pool.query("INSERT INTO memberships(user_id,site_id,role) VALUES($1,$2,$3)",[nu.id,req.body.site_id,req.body.site_role||req.body.role||"USER"]);
  res.json(nu);
 }catch(e){res.status(400).json({error:e.code==="23505"?"이미 등록된 이메일입니다.":e.message})}
});
app.post("/api/users/:id/sites",auth,async(req,res)=>{
 const u=await user(req);if(u.role!=="ADMIN")return res.status(403).json({error:"관리자만 사용자를 현장에 배정할 수 있습니다."});
 await pool.query("INSERT INTO memberships(user_id,site_id,role) VALUES($1,$2,$3) ON CONFLICT(user_id,site_id) DO UPDATE SET role=EXCLUDED.role",
 [req.params.id,req.body.site_id,req.body.role||"USER"]);
 res.json({ok:true});
});

app.use((req,res)=>{if(req.method==="GET")res.sendFile(path.join(__dirname,"public","index.html"));else res.status(404).json({error:"요청을 찾을 수 없습니다."})});
init().then(()=>app.listen(PORT,"0.0.0.0",()=>console.log(`Safety app running on ${PORT}`))).catch(e=>{console.error(e);process.exit(1)});
