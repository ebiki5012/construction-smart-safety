from pathlib import Path
from playwright.sync_api import sync_playwright
import json,re
root=Path(__file__).resolve().parents[1]/'public'
output=Path('/tmp/v26-preview');output.mkdir(exist_ok=True)
html=(root/'index.html').read_text();html=re.sub(r'<link rel="stylesheet" href="/([^"?]+)[^" ]*">',lambda m:'<style>'+ (root/m[1]).read_text()+'</style>',html);html=re.sub(r'<script src="/([^"?]+)[^" ]*"></script>',lambda m:'<script>'+ (root/m[1]).read_text()+'</script>',html)
js=r'''<script>
const role=ROLE;const myId=role==='SAFETY_MANAGER'?20:role==='SITE_DIRECTOR'?30:10;const week='2026-11-23';let companyApproved=role==='MANAGER'||role==='SAFETY_MANAGER';let fixtureRisk={id:7,author_id:myId,site_id:1,contractor_id:5,contractor_name:'동양철근',author_name:'김담당',risk_date:'2026-11-26',period_start:week,period_end:'2026-11-29',category:'frame',area:'3층 A구역',work:'철근 조립',hazard:'철근 단부에 찔림',measure:'보호캡 설치',frequency:2,severity:3,score:6,level:'높음',entry_mode:'DIRECT'};
const a={id:11,site_id:1,week_start:week,revision:1,status:'PENDING',approval_stage:'SAFETY',review_role:'SAFETY_MANAGER',item_count:1,submitted_by_name:'원청 공사담당',submitted_at:'2026-11-26T03:15:00Z',safety_user_id:20,safety_assignee_name:'정안전',director_user_id:30,director_assignee_name:'최현장',meeting_date:'2026-11-26',attendees:'현장 담당자',meeting_notes:'철근 작업 확인'};
const b={...a,id:12,week_start:'2026-11-16',status:'APPROVED',approval_stage:'COMPLETE',review_role:'NONE',safety_user_id:null,safety_assignee_name:null,approved_by_name:'최현장',approved_at:'2026-11-20T03:00:00Z'};
window._calls=[];window.confirm=()=>true;window.fetch=async (url,opt={})=>{let u=new URL(url,'http://localhost'),path=u.pathname,method=opt.method||'GET',d=[];if(method!=='GET')window._calls.push([method,path,opt.body]);
if(path==='/api/me')d={user:{id:myId,name:role==='SAFETY_MANAGER'?'정안전':role==='SITE_DIRECTOR'?'최현장':'김담당',role:role==='ADMIN'?'ADMIN':'USER',username:'test'}};
else if(path==='/api/sites')d=[{id:1,name:'시범 현장',status:'진행중'}];
else if(path==='/api/appearance')d={company_name:'스마트 안전관리',primary_color:'#2459a9',logo_url:'',menu_visibility:{},global:{company_name:'스마트 안전관리',primary_color:'#2459a9',logo_url:''}};
else if(path==='/api/v8/site-context')d={role,site_id:1,contractor_id:['USER','CONTRACTOR_MANAGER'].includes(role)?5:null,company_required:['USER','CONTRACTOR_MANAGER'].includes(role)};
else if(path==='/api/v6/contractors')d=[{id:5,site_id:1,name:'동양철근',active:true}];
else if(path==='/api/settings')d={frequency_labels:{1:'거의 발생하지 않음',2:'가끔',3:'자주'},severity_labels:{1:'경미',2:'중대',3:'치명'},low_max:3,medium_max:5};
else if(path==='/api/dashboard')d={riskCount:1,highRiskCount:1,actionOpen:2,todayTbm:3,new_today:5,my_weekly_pending:role==='SAFETY_MANAGER'?1:0,weekly_pending:2,company_submitted:1,tbm_review_pending:1,overdue_actions:1,verification_pending:1,week_unregistered:1,work_role:role,recent:[{kind:'risk',id:7,title:'철근 조립',contractor_name:'동양철근',author_name:'김담당',record_date:'2026-11-26'}]};
else if(path==='/api/risks'){if(method==='POST'){const v=JSON.parse(opt.body);fixtureRisk={...fixtureRisk,...v,id:7};d=fixtureRisk;}else d=[fixtureRisk];}
else if(path==='/api/tbms')d=method==='POST'?{id:45}:[];else if(path==='/api/photos'&&method==='POST')return {ok:false,json:async()=>({error:'모의 사진 전송 실패'})};else if(path==='/api/templates'){if(method==='POST')d={id:99};else d=[{...fixtureRisk,id:8,name:'철근 표준',hazard_type:'끼임·충돌'}];}
else if(path==='/api/v7/weekly')d=method==='POST'?{id:11}:[b];else if(path==='/api/v7/weekly/preview')d=[fixtureRisk];else if(path.match(/\/api\/v7\/weekly\/\d+\/items/))d=[fixtureRisk];
else if(path==='/api/v16/approvers')d={site_id:1,can_configure:false,review_role:'SAFETY_MANAGER',safety_name:'정안전',safety_user_id:20,director_name:'최현장',director_user_id:30,candidates:[]};
else if(path==='/api/v16/contractor-approvals'){const missing=role==='USER',approved=companyApproved;d={site_id:1,week_start:u.searchParams.get('week_start'),locked:false,companies:[{id:5,name:'부흥건설',risk_count:1,status:approved?'APPROVED':'SUBMITTED',is_current:true,submitted_by_name:'협력사 담당',approved_by_name:approved?'박협력':null,managers:missing?[]:['박협력'],can_submit:false,can_approve:role==='CONTRACTOR_MANAGER'&&!companyApproved}]};}
else if(path==='/api/v25/company-inbox')d={items:[{week_start:week,contractor_id:5,name:'부흥건설',status:companyApproved?'APPROVED':'SUBMITTED',is_current:true,risk_count:1,managers:role==='USER'?[]:['박협력'],submitted_by_name:'협력사 담당',approved_by_name:'박협력'}],more:false};
else if(path==='/api/v16/contractor/decision'){companyApproved=true;d={status:'APPROVED'};}
else if(path.endsWith('/stages')){const done=path.includes('/12/');d={contractor_history_available:true,contractor_approvals:[{contractor_id:5,contractor_name:'동양철근',status:'APPROVED',approved_by_name:'박협력',approved_at:'2026-11-26T02:00:00Z'}],safety_name:done?null:'정안전',director_name:'최현장',stages:done?[{revision:1,stage:'DIRECTOR',action:'APPROVE',actor_name:'최현장',created_at:'2026-11-20T03:00:00Z'}]:[],companies:[{contractor_name:'동양철근',actor_name:'박협력',action:'APPROVE',created_at:'2026-11-26T02:00:00Z'}]};}
else if(path==='/api/v21/board')d={manager:false,rows:[]};else if(path==='/api/v21/shared')d={permissions:{},rows:[]};else if(path==='/api/photos/status')d={configured:true};return {ok:true,json:async()=>d};};
</script>'''
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for width in [320,360,390,430,768,1280]:
  p=browser.new_page(viewport={'width':width,'height':900},locale='ko-KR');errors=[];p.on('pageerror',lambda e:errors.append(str(e)));p.set_content(html.replace('<head>','<head>'+js.replace('ROLE',json.dumps('ADMIN')),1));p.wait_for_selector('#app:not(.hidden)');p.wait_for_selector('#v24Dashboard .v24-metrics');p.wait_for_timeout(200)
  p.evaluate("v24RenderDashboard({totals:{todayTbm:123,actionOpen:12},sites:[{id:1,name:'신대방동 가족형 관광숙박시설 신축공사',status:'진행중',company_count:2,today_tbm:123,open_count:12,weekly_pending:4,tbm_pending:5},{id:2,name:'○○아파트 신축공사',status:'진행중',company_count:0,today_tbm:0,open_count:0,weekly_pending:0}]},true)")
  assert p.locator('.v24-site').count()==2
  for row in p.locator('.v24-site').all():
   assert row.bounding_box()['height']<170,row.bounding_box()
   for metric in row.locator('.v24-site-counts>span').all():
    assert metric.evaluate('(e)=>e.scrollWidth<=e.clientWidth+1 && e.clientWidth>=65'),metric.bounding_box()
    assert metric.bounding_box()['height']<65
  assert p.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
  p.screenshot(path=str(output/f'home_{width}.png'));print('PASS V26 long-name dashboard',width,flush=True);p.close()
 browser.close()
