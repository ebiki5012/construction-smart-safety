from playwright.sync_api import sync_playwright
from pathlib import Path
from urllib.parse import urlparse, parse_qs
import json, mimetypes
root=Path(__file__).resolve().parents[1]/'public'
output=Path('/tmp/v21-preview');output.mkdir(exist_ok=True)
company=[{'id':5,'site_id':1,'name':'동양철근','active':True},{'id':6,'site_id':1,'name':'한빛건설','active':True}]
post={'id':10,'site_id':1,'contractor_id':None,'title':'동절기 안전점검 안내','body':'작업 전 통로 및 결빙 상태를 확인하세요.','category':'NOTICE','pinned':True,'active':True,'acknowledged':False,'revision':1,'author_name':'현장관리자','created_at':'2026-11-27'}
post2={**post,'id':11,'title':'철근공사 협력사 공지','contractor_id':5,'contractor_name':'동양철근','pinned':False,'category':'WORK'}
users=[{'id':7,'name':'김담당','email':'site-abc@account.invalid','username':'worker7','active':True,'role':'USER','sites':[{'site_id':1,'site_name':'시범 현장','site_role':'USER','contractor_id':5,'contractor_name':'동양철근'}]}]
permissions=[{'id':5,'name':'동양철근','risk':True,'tbm':False,'action':False},{'id':6,'name':'한빛건설','risk':False,'tbm':False,'action':False}]
import re
html=(root/'index.html').read_text()
html=re.sub(r'<link rel="stylesheet" href="/([^"?]+)[^" ]*">', lambda m:'<style>'+ (root/m[1]).read_text()+'</style>', html)
html=re.sub(r'<script src="/([^"?]+)[^" ]*"></script>', lambda m:'<script>'+ (root/m[1]).read_text()+'</script>', html)
def offline(role):
 data={"company":company,"post":post,"post2":post2,"users":users,"permissions":permissions,"role":role}
 js=r'''<script>const fixture=DATA;window._calls=[];let ack=false;window.fetch=async function(url,opt={}){const u=new URL(url,'http://localhost'),path=u.pathname,sid=u.searchParams.get('site_id')||'1',method=opt.method||'GET',role=fixture.role,manager=role==='ADMIN'||role==='MANAGER',globalrole=role==='ADMIN'?'ADMIN':'USER';let d=[];if(method!=='GET')window._calls.push([method,path,opt.body]);
if(path==='/api/me')d={user:{id:1,name:manager?'테스트 관리자':'테스트 담당자',role:globalrole,username:'testuser'}};
else if(path==='/api/sites')d=globalrole==='ADMIN'?[{id:1,name:'시범 현장',status:'진행중'},{id:2,name:'다른 현장',status:'진행중'}]:[{id:1,name:'시범 현장',status:'진행중'}];
else if(path==='/api/appearance')d={company_name:'스마트 안전관리',primary_color:'#2459a9',logo_url:'',menu_visibility:{},global:{company_name:'스마트 안전관리',primary_color:'#2459a9',logo_url:''}};
else if(path==='/api/v8/site-context')d={role,site_id:1,contractor_id:manager?null:5,company_required:!manager};
else if(path==='/api/v6/contractors')d=sid==='1'?(manager?fixture.company:fixture.company.slice(0,1)):[{id:8,name:'별도 업체',site_id:2,active:true}];
else if(path==='/api/dashboard')d={riskCount:2,highRiskCount:1,actionOpen:0,todayTbm:1,recent:[]};
else if(path==='/api/overview')d={sites:[],totals:{riskCount:0,highRiskCount:0,actionOpen:0,todayTbm:0}};
else if(path==='/api/settings')d={frequency_labels:{1:'거의 발생하지 않음',2:'가끔',3:'자주'},severity_labels:{1:'경미',2:'중대',3:'치명'},low_max:3,medium_max:5};
else if(path==='/api/v21/board')d=method==='POST'?{id:20}:{manager,global:globalrole==='ADMIN',rows:sid==='all'?[]:[{...fixture.post,acknowledged:ack,editable:manager},{...fixture.post2,editable:manager}]};
else if(path==='/api/v21/board/10/read'){ack=true;d={ok:true};}
else if(path==='/api/v21/board/10/receipts')d=[{name:'테스트 담당자',site_name:'시범 현장',read_at:null}];
else if(path==='/api/v21/shared')d={permissions:{risk:true,tbm:false,action:false},rows:[{record_date:'2026-11-23',company:'한빛건설',title:'철근 배근',hazard:'넘어짐',measure:'통로 확보',score:'3'}]};
else if(path==='/api/v21/company-permissions')d=fixture.permissions;
else if(path.startsWith('/api/v21/company-permissions/'))d={ok:true};
else if(path==='/api/v17/site-accounts')d=[{id:7,name:'김담당',username:'worker7',active:true,role:'USER',contractor_id:5,contractor_name:'동양철근',editable:true}];
else if(path==='/api/users')d=method==='GET'?fixture.users:{id:30};
else if(path.startsWith('/api/users/'))d={ok:true};
else if(path==='/api/v16/approvers')d={can_configure:manager,candidates:[]};
else if(path==='/api/photos/status')d={configured:true};return {ok:true,json:async()=>d};};</script>'''
 return html.replace('<head>','<head>'+js.replace('DATA',json.dumps(data,ensure_ascii=False)),1)
def check(p):
 p.wait_for_timeout(300)
 assert p.evaluate('document.documentElement.scrollWidth <= innerWidth+1'),p.evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth})')
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for role,width in [('USER',390),('MANAGER',390),('ADMIN',1280)]:
  errors=[];p=browser.new_page(viewport={'width':width,'height':850});p.on('pageerror',lambda e: errors.append(str(e)));
  p.set_content(offline(role));p.wait_for_selector('#app:not(.hidden)',timeout=8000);p.wait_for_timeout(500)
  if role=='ADMIN':
   p.evaluate("show('admin');document.querySelector('[data-tab=usersTab]').click()")
   p.locator('details.v15-user-create summary').click();p.locator('#v21CreateCompany option[value="5"]').wait_for(state='attached');p.locator('#un').fill('신규 담당');p.locator('#uu').fill('newperson');p.locator('#up').fill('example-password');p.locator('#ur').select_option('CONTRACTOR_MANAGER');p.locator('#v21CreateCompany').select_option('5');p.screenshot(path=str(output/'v21_user_register_preview.png'));p.get_by_role('button',name='등록 완료',exact=True).click();p.wait_for_timeout(250);assert any(path=='/api/users' and json.loads(data)['contractor_id']=='5' and json.loads(data)['site_role']=='CONTRACTOR_MANAGER' for method,path,data in p.evaluate("window._calls"))
   p.evaluate("openUserModal(7)");p.locator('#v21AssignCompany option[value="5"]').wait_for(state='attached');assert p.locator('#v21AssignCompany').input_value()=='5';p.evaluate("closeUserModal();selectSite(1)");p.wait_for_timeout(400)
  elif role=='MANAGER':
   p.evaluate("show('companies')");p.locator('[data-v21-company=permissions]').click();p.locator('#v21Permissions form').first.wait_for();p.locator('#v21Permissions form').first.locator('[name=tbm]').check();p.locator('#v21Permissions form').first.get_by_role('button',name='저장').click();p.wait_for_timeout(200);assert any(path=='/api/v21/company-permissions/5' and json.loads(data)['permissions']['tbm'] for method,path,data in p.evaluate("window._calls"));p.locator('#v21Permissions').scroll_into_view_if_needed();p.screenshot(path=str(output/'v21_permissions_preview.png'));check(p)
  else:
   p.locator('#v21DashNotices').get_by_text('동절기 안전점검 안내').wait_for();p.locator('#v21DashNotices').get_by_text('동절기 안전점검 안내').click();p.locator('#v21Post10[open]').wait_for();p.locator('#v21Post10').get_by_role('button',name='내용 확인했습니다').click();p.locator('#v21Post10 .v21-read-label').get_by_text('확인',exact=True).wait_for();assert any(path=='/api/v21/board/10/read' for method,path,data in p.evaluate("window._calls"))
  p.evaluate("show('board')");p.locator('#v21Post10').wait_for();p.screenshot(path=str(output/f'v21_board_{role.lower()}_preview.png'));check(p)
  if role=='USER':
   p.locator('[data-v21-tab=shared]').click();p.get_by_text('철근 배근',exact=True).wait_for();assert p.locator('[data-v21-shared]').count()==1;check(p)
  if role=='MANAGER':
   p.locator('[data-v21-tab=manage]').click();p.locator('#v21NewPost').click();p.locator('#v21PostTarget option[value="5"]').wait_for(state='attached');p.locator('#v21PostTarget').select_option('5');p.locator('#v21PostTitle').fill('작업 전 안전교육');p.locator('#v21PostBody').fill('통로 안전 확인');p.locator('#v21PostForm').get_by_role('button',name='게시하기').click();p.wait_for_timeout(250);assert any(path=='/api/v21/board' and json.loads(data)['contractor_id']=='5' for method,path,data in p.evaluate("window._calls"));p.locator('[data-op=RECEIPTS][data-id="10"]').click();p.get_by_text('테스트 담당자',exact=False).wait_for();check(p)
  assert not errors,errors
  print('PASS browser',role,width,p.evaluate("window._calls"));p.close()
 browser.close()
