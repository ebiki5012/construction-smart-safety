from pathlib import Path
from playwright.sync_api import sync_playwright
import json,re
root=Path(__file__).resolve().parents[1]/'public'
output=Path('/tmp/v24-preview');output.mkdir(exist_ok=True)
html=(root/'index.html').read_text();html=re.sub(r'<link rel="stylesheet" href="/([^"?]+)[^" ]*">',lambda m:'<style>'+ (root/m[1]).read_text()+'</style>',html);html=re.sub(r'<script src="/([^"?]+)[^" ]*"></script>',lambda m:'<script>'+ (root/m[1]).read_text()+'</script>',html)
js=r'''<script>
const role=ROLE;const myId=role==='SAFETY_MANAGER'?20:role==='SITE_DIRECTOR'?30:10;const week='2026-11-23';let fixtureRisk={id:7,author_id:myId,site_id:1,contractor_id:5,contractor_name:'동양철근',author_name:'김담당',risk_date:'2026-11-26',period_start:week,period_end:'2026-11-29',category:'frame',area:'3층 A구역',work:'철근 조립',hazard:'철근 단부에 찔림',measure:'보호캡 설치',frequency:2,severity:3,score:6,level:'높음',entry_mode:'DIRECT'};
const a={id:11,site_id:1,week_start:week,revision:1,status:'PENDING',approval_stage:'SAFETY',review_role:'SAFETY_MANAGER',item_count:1,submitted_by_name:'원청 공사담당',submitted_at:'2026-11-26T03:15:00Z',safety_user_id:20,safety_assignee_name:'정안전',director_user_id:30,director_assignee_name:'최현장',meeting_date:'2026-11-26',attendees:'현장 담당자',meeting_notes:'철근 작업 확인'};
const b={...a,id:12,week_start:'2026-11-16',status:'APPROVED',approval_stage:'COMPLETE',review_role:'NONE',safety_user_id:null,safety_assignee_name:null,approved_by_name:'최현장',approved_at:'2026-11-20T03:00:00Z'};
window._calls=[];window.confirm=()=>true;window.fetch=async (url,opt={})=>{let u=new URL(url,'http://localhost'),path=u.pathname,method=opt.method||'GET',d=[];if(method!=='GET')window._calls.push([method,path,opt.body]);
if(path==='/api/me')d={user:{id:myId,name:role==='SAFETY_MANAGER'?'정안전':role==='SITE_DIRECTOR'?'최현장':'김담당',role:'USER',username:'test'}};
else if(path==='/api/sites')d=[{id:1,name:'시범 현장',status:'진행중'}];
else if(path==='/api/appearance')d={company_name:'스마트 안전관리',primary_color:'#2459a9',logo_url:'',menu_visibility:{},global:{company_name:'스마트 안전관리',primary_color:'#2459a9',logo_url:''}};
else if(path==='/api/v8/site-context')d={role,site_id:1,contractor_id:['USER','CONTRACTOR_MANAGER'].includes(role)?5:null,company_required:['USER','CONTRACTOR_MANAGER'].includes(role)};
else if(path==='/api/v6/contractors')d=[{id:5,site_id:1,name:'동양철근',active:true}];
else if(path==='/api/settings')d={frequency_labels:{1:'거의 발생하지 않음',2:'가끔',3:'자주'},severity_labels:{1:'경미',2:'중대',3:'치명'},low_max:3,medium_max:5};
else if(path==='/api/dashboard')d={riskCount:1,highRiskCount:1,actionOpen:2,todayTbm:3,new_today:5,my_weekly_pending:role==='SAFETY_MANAGER'?1:0,weekly_pending:2,company_submitted:1,tbm_review_pending:1,overdue_actions:1,verification_pending:1,week_unregistered:1,work_role:role,recent:[{kind:'risk',id:7,title:'철근 조립',contractor_name:'동양철근',author_name:'김담당',record_date:'2026-11-26'}]};
else if(path==='/api/risks'){if(method==='POST'){const v=JSON.parse(opt.body);fixtureRisk={...fixtureRisk,...v,id:7};d=fixtureRisk;}else d=[fixtureRisk];}
else if(path==='/api/tbms')d=method==='POST'?{id:45}:[];else if(path==='/api/photos'&&method==='POST')return {ok:false,json:async()=>({error:'모의 사진 전송 실패'})};else if(path==='/api/templates'){if(method==='POST')d={id:99};else d=[{...fixtureRisk,id:8,name:'철근 표준',hazard_type:'끼임·충돌'}];}
else if(path==='/api/v7/weekly')d=[a,b];else if(path==='/api/v7/weekly/preview')d=[fixtureRisk];else if(path.match(/\/api\/v7\/weekly\/\d+\/items/))d=[fixtureRisk];
else if(path==='/api/v16/approvers')d={site_id:1,can_configure:false,review_role:'SAFETY_MANAGER',safety_name:'정안전',safety_user_id:20,director_name:'최현장',director_user_id:30,candidates:[]};
else if(path==='/api/v16/contractor-approvals')d={week_start:week,locked:false,companies:[{id:5,name:'동양철근',risk_count:1,status:'APPROVED',is_current:true,approved_by_name:'박협력',approved_at:'2026-11-26T02:00:00Z',submitted_by_name:'김담당',submitted_at:'2026-11-26T01:00:00Z',managers:['박협력']}]};
else if(path.endsWith('/stages')){const done=path.includes('/12/');d={contractor_history_available:true,contractor_approvals:[{contractor_id:5,contractor_name:'동양철근',status:'APPROVED',approved_by_name:'박협력',approved_at:'2026-11-26T02:00:00Z'}],safety_name:done?null:'정안전',director_name:'최현장',stages:done?[{revision:1,stage:'DIRECTOR',action:'APPROVE',actor_name:'최현장',created_at:'2026-11-20T03:00:00Z'}]:[],companies:[{contractor_name:'동양철근',actor_name:'박협력',action:'APPROVE',created_at:'2026-11-26T02:00:00Z'}]};}
else if(path==='/api/v21/board')d={manager:false,rows:[]};else if(path==='/api/v21/shared')d={permissions:{},rows:[]};else if(path==='/api/photos/status')d={configured:true};return {ok:true,json:async()=>d};};
</script>'''
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for role,width in [('USER',360),('CONTRACTOR_MANAGER',390),('MANAGER',430),('SAFETY_MANAGER',1280),('SITE_DIRECTOR',390)]:
  p=browser.new_page(viewport={'width':width,'height':900},locale='ko-KR',timezone_id='Asia/Seoul');errors=[];p.on('pageerror',lambda e:errors.append(str(e)));p.set_content(html.replace('<head>','<head>'+js.replace('ROLE',json.dumps(role)),1));p.wait_for_selector('#app:not(.hidden)',timeout=10000);p.wait_for_selector('#v24Dashboard .v24-quick');p.wait_for_timeout(300)
  assert p.locator('#v24Dashboard .v24-quick').count()==4,p.locator('#v24Dashboard').inner_text()
  assert p.locator('[data-v24-go="mine"]').count()==(1 if role in ('MANAGER','SAFETY_MANAGER','SITE_DIRECTOR') else 0)
  assert p.locator('[data-v24-go="tbm-approval"]').count()==(1 if role=='MANAGER' else 0)
  assert p.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
  if role in ['USER','SAFETY_MANAGER']:p.screenshot(path=str(output/f'v24_{"mobile" if width<901 else "desktop"}_home.png'))
  if role=='USER':
   p.locator('[data-v24-go="risk-write"]').click();p.wait_for_timeout(200);p.evaluate('editRecord("risk",7)');p.wait_for_selector('#v8EditConfirm');p.locator('#v8-edit-measure').fill('보호캡 설치 및 점검');p.locator('#v8EditConfirm').click();p.wait_for_timeout(200);assert any(path=='/api/v24/drafts/risk/7' for m,path,v in p.evaluate('window._calls'));p.evaluate("show('dashboard')");p.wait_for_selector('[data-v24-go="tbm-write"]')
  if role=='SAFETY_MANAGER':
   p.locator('[data-v24-go="mine"]').click();p.wait_for_timeout(400);assert p.locator('#reviewStatusFilter').input_value()=='MINE';assert p.locator('#v7WeeklyList [data-review-id]').count()==1
  else:
   p.locator('[data-v24-go="tbm-write"]').click();p.wait_for_timeout(400);p.locator('#td').fill('2026-11-26');p.locator('#td').dispatch_event('change');
   if role in ['MANAGER','SITE_DIRECTOR']:p.locator('#tbmContractor').select_option('5')
   p.locator('#tr').select_option('7');p.locator('#v24ApplyRisk').click();assert p.locator('#tw').input_value()=='철근 조립';assert p.locator('#th').input_value()=='철근 단부에 찔림';assert p.locator('#tm').input_value()=='보호캡 설치'
   if role=='USER':p.locator('#v24TbmPreview').scroll_into_view_if_needed();p.screenshot(path=str(output/'v24_mobile_tbm.png'))
   p.locator('#tp').fill('0');p.evaluate('saveTbm()');assert not any(path=='/api/tbms' for m,path,v in p.evaluate('window._calls'));p.locator('#tp').fill('5');p.locator('#tbmPhotos').set_input_files({'name':'test.jpg','mimeType':'image/jpeg','buffer':b'\xff\xd8\xff\xd9'});p.evaluate('saveTbm()');p.wait_for_selector('#v24Receipttbm:not(.hidden)');assert '사진 첨부 실패' in p.locator('#v24Receipttbm').inner_text();assert p.locator('#tw').input_value()==''
   p.evaluate('saveTbm()');assert len([v for m,path,v in p.evaluate('window._calls') if path=='/api/tbms'])==1
   p.locator('#v24Receipttbm [data-v24-saved="photos"]').click();assert p.locator('#photoModal').is_visible();assert p.evaluate('photoTarget.id')==45;p.evaluate('closePhotoModal()')
   p.locator('#td').fill('2027-01-01');p.locator('#td').dispatch_event('change');assert p.locator('#tr option').count()==1;p.locator('#v24PastRisk').check();assert p.locator('#tr option').count()==2
  assert p.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),p.evaluate('({sw:document.documentElement.scrollWidth,w:innerWidth})');assert not errors,errors
  print('PASS V24 browser',role,width,flush=True);p.close()
 browser.close()
