from pathlib import Path
from playwright.sync_api import sync_playwright
import json,re
root=Path(__file__).resolve().parents[1]/'public'
output=Path(__file__).resolve().parent/'v23-preview';output.mkdir(exist_ok=True)
html=(root/'index.html').read_text();html=re.sub(r'<link rel="stylesheet" href="/([^"?]+)[^" ]*">',lambda m:'<style>'+ (root/m[1]).read_text()+'</style>',html);html=re.sub(r'<script src="/([^"?]+)[^" ]*"></script>',lambda m:'<script>'+ (root/m[1]).read_text()+'</script>',html)
js=r'''<script>
const role=ROLE;const myId=role==='SAFETY_MANAGER'?20:role==='SITE_DIRECTOR'?30:10;const week='2026-11-23';let fixtureRisk={id:7,site_id:1,contractor_id:5,contractor_name:'동양철근',author_name:'김담당',risk_date:'2026-11-26',period_start:week,period_end:'2026-11-29',category:'frame',area:'3층 A구역',work:'철근 조립',hazard:'철근 단부에 찔림',measure:'보호캡 설치',frequency:2,severity:3,score:6,level:'높음',entry_mode:'DIRECT'};
const a={id:11,site_id:1,week_start:week,revision:1,status:'PENDING',approval_stage:'SAFETY',review_role:'SAFETY_MANAGER',item_count:1,submitted_by_name:'원청 공사담당',submitted_at:'2026-11-26T03:15:00Z',safety_user_id:20,safety_assignee_name:'정안전',director_user_id:30,director_assignee_name:'최현장',meeting_date:'2026-11-26',attendees:'현장 담당자',meeting_notes:'철근 작업 확인'};
const b={...a,id:12,week_start:'2026-11-16',status:'APPROVED',approval_stage:'COMPLETE',review_role:'NONE',safety_user_id:null,safety_assignee_name:null,approved_by_name:'최현장',approved_at:'2026-11-20T03:00:00Z'};
window._calls=[];window.confirm=()=>true;window.fetch=async (url,opt={})=>{let u=new URL(url,'http://localhost'),path=u.pathname,method=opt.method||'GET',d=[];if(method!=='GET')window._calls.push([method,path,opt.body]);
if(path==='/api/me')d={user:{id:myId,name:role==='SAFETY_MANAGER'?'정안전':role==='SITE_DIRECTOR'?'최현장':'김담당',role:'USER',username:'test'}};
else if(path==='/api/sites')d=[{id:1,name:'시범 현장',status:'진행중'}];
else if(path==='/api/appearance')d={company_name:'스마트 안전관리',primary_color:'#2459a9',logo_url:'',menu_visibility:{},global:{company_name:'스마트 안전관리',primary_color:'#2459a9',logo_url:''}};
else if(path==='/api/v8/site-context')d={role,site_id:1,contractor_id:role==='USER'?5:null,company_required:role==='USER'};
else if(path==='/api/v6/contractors')d=[{id:5,site_id:1,name:'동양철근',active:true}];
else if(path==='/api/settings')d={frequency_labels:{1:'거의 발생하지 않음',2:'가끔',3:'자주'},severity_labels:{1:'경미',2:'중대',3:'치명'},low_max:3,medium_max:5};
else if(path==='/api/dashboard')d={riskCount:1,highRiskCount:1,actionOpen:0,todayTbm:0,recent:[]};
else if(path==='/api/risks'){if(method==='POST'){const v=JSON.parse(opt.body);fixtureRisk={...fixtureRisk,...v,id:7};d=fixtureRisk;}else d=[fixtureRisk];}
else if(path==='/api/templates'){if(method==='POST')d={id:99};else d=[{...fixtureRisk,id:8,name:'철근 표준',hazard_type:'끼임·충돌'}];}
else if(path==='/api/v7/weekly')d=[a,b];else if(path==='/api/v7/weekly/preview')d=[fixtureRisk];else if(path.match(/\/api\/v7\/weekly\/\d+\/items/))d=[fixtureRisk];
else if(path==='/api/v16/approvers')d={site_id:1,can_configure:false,review_role:'SAFETY_MANAGER',safety_name:'정안전',safety_user_id:20,director_name:'최현장',director_user_id:30,candidates:[]};
else if(path==='/api/v16/contractor-approvals')d={week_start:week,locked:false,companies:[{id:5,name:'동양철근',risk_count:1,status:'APPROVED',is_current:true,approved_by_name:'박협력',approved_at:'2026-11-26T02:00:00Z',submitted_by_name:'김담당',submitted_at:'2026-11-26T01:00:00Z',managers:['박협력']}]};
else if(path.endsWith('/stages')){const done=path.includes('/12/');d={contractor_history_available:true,contractor_approvals:[{contractor_id:5,contractor_name:'동양철근',status:'APPROVED',approved_by_name:'박협력',approved_at:'2026-11-26T02:00:00Z'}],safety_name:done?null:'정안전',director_name:'최현장',stages:done?[{revision:1,stage:'DIRECTOR',action:'APPROVE',actor_name:'최현장',created_at:'2026-11-20T03:00:00Z'}]:[],companies:[{contractor_name:'동양철근',actor_name:'박협력',action:'APPROVE',created_at:'2026-11-26T02:00:00Z'}]};}
else if(path==='/api/v21/board')d={manager:false,rows:[]};else if(path==='/api/v21/shared')d={permissions:{},rows:[]};else if(path==='/api/photos/status')d={configured:true};return {ok:true,json:async()=>d};};
</script>'''
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for role,width in [('USER',390),('SAFETY_MANAGER',390),('SAFETY_MANAGER',1280),('SITE_DIRECTOR',430)]:
  p=browser.new_page(viewport={'width':width,'height':900},locale='ko-KR',timezone_id='Asia/Seoul');errors=[];p.on('pageerror',lambda e:errors.append(str(e)));p.set_content(html.replace('<head>','<head>'+js.replace('ROLE',json.dumps(role)),1));p.wait_for_selector('#app:not(.hidden)',timeout=10000);p.wait_for_timeout(300)
  p.evaluate("v12OpenWorkspace('write')");p.locator('#riskCategory').wait_for(state='visible');p.wait_for_timeout(500)
  assert p.locator('#riskCategory option').count()==10
  if role=='USER':
   p.locator('#riskCategory').select_option('frame');p.locator('#ra').fill('3층 A구역');p.locator('#rw').fill('철근 조립');p.locator('#rh').fill('단부 찔림');p.locator('#rm').fill('보호캡 설치');p.locator('#rf').select_option('2');p.locator('#rs').select_option('3');p.locator('#riskCategory').scroll_into_view_if_needed();p.screenshot(path=str(output/'v23_mobile_category.png'));p.evaluate('saveRisk()');p.wait_for_timeout(400);calls=p.evaluate('window._calls');payload=[json.loads(v) for m,path,v in calls if m=='POST' and path=='/api/risks'];assert payload and payload[-1]['category']=='frame' and payload[-1]['area']=='3층 A구역',calls
   p.locator('.v23-saved-risk button').click();p.wait_for_selector('#v22EditForm');assert p.locator('#v22Category').input_value()=='frame';p.locator('#v22Close').click();p.locator('.v15-template-launch').click();p.wait_for_selector('.v22-card');assert '골조' in p.locator('#v22GroupLabel').inner_text();p.locator('[data-v22-use="8"]').click();p.wait_for_timeout(300);assert p.locator('#riskCategory').input_value()=='frame';assert p.locator('#ra').input_value()=='3층 A구역'
   p.evaluate('toTpl(7)');p.wait_for_selector('#v22EditForm');assert p.locator('#v22Category').input_value()=='frame' and p.locator('#v22Category').is_disabled();p.locator('#v22EditSave').click();p.wait_for_timeout(200);assert any(path=='/api/templates' and json.loads(v)['category']=='frame' for m,path,v in p.evaluate('window._calls') if m=='POST')
  else:
   p.evaluate("v12ShowMode('document');reviewUi.selectWeekly(11)");p.wait_for_selector('.v23-current-approval');p.wait_for_timeout(400);assert '정안전' in p.locator('.v23-current-approval').inner_text(),p.locator('.v23-current-approval').inner_text();assert p.locator('.v16-step.current').count()==1;assert p.locator('.v16-step.done').count()==1;assert p.locator('.v16-decision-actions .v16-action-approve').count()==(1 if role=='SAFETY_MANAGER' else 0)
   if role=='SAFETY_MANAGER':
    p.locator('.v16-document-trail').scroll_into_view_if_needed();p.screenshot(path=str(output/f'v23_{"mobile" if width<901 else "desktop"}_approval.png'));
    if width<901:p.locator('.v20-doc-list summary').click()
    p.locator('#reviewStatusFilter').select_option('MINE');assert p.locator('#v7WeeklyList [data-review-id]').count()==1;assert p.locator('#v7WeeklyList [data-review-id="11"]').count()==1;p.locator('#reviewStatusFilter').select_option('ALL');
   p.evaluate('reviewUi.selectWeekly(12)');p.wait_for_function("document.querySelector('.v23-current-approval')?.innerText.includes('최종 승인 완료')");assert p.locator('.v16-step').count()==2;assert p.locator('.v16-action-approve').count()==0
  assert p.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),p.evaluate('({sw:document.documentElement.scrollWidth,w:innerWidth})');assert not errors,errors
  print('PASS browser',role,width,flush=True);p.close()
 browser.close()
