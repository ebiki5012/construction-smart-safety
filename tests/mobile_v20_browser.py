from playwright.sync_api import sync_playwright
from pathlib import Path
from urllib.parse import urlparse,parse_qs
import json,re
from datetime import datetime, timezone
root=Path(__file__).resolve().parents[1]/'public'
import os
out=Path(os.environ.get('V20_SCREENSHOT_DIR','/tmp/v20-screenshots'));out.mkdir(parents=True,exist_ok=True)
errors=[]; unknown=set(); writes=[]
role='MANAGER'
week='2026-11-23'
risk={'id':11,'risk_date':'2026-11-26','period_start':week,'period_end':'2026-11-29','area':'철근공사','work':'철근 조립','hazard':'작업 중 추락','frequency':2,'severity':3,'score':6,'level':'높음','measure':'안전난간 설치','contractor_id':2,'contractor_name':'테스트건설','author_name':'테스트 담당자'}
company={'id':2,'name':'테스트건설','risk_count':1,'status':'SUBMITTED','is_current':True,'can_submit':True,'can_approve':False,'managers':['협력사 관리자']}
d={
 '/api/me':{'user':{'id':3,'name':'테스트 관리자','role':'USER','username':'test'}},
 '/api/sites':[{'id':1,'name':'테스트 현장','status':'진행중'}],
 '/api/appearance':{'primary_color':'#f4c400','company_name':'스마트 안전관리','menu_visibility':{}},
 '/api/v8/site-context':{'role':role,'company_required':role=='USER','contractor_id':2 if role=='USER' else None},
 '/api/v6/contractors':[{'id':2,'name':'테스트건설'}],
 '/api/settings':{'frequency_labels':{'1':'거의 발생하지 않음','2':'가끔 발생','3':'자주 발생'},'severity_labels':{'1':'경미','2':'중간','3':'중대'}},
 '/api/dashboard':{'riskCount':1,'highRiskCount':1,'actionOpen':1,'todayTbm':0,'recent':[]},
 '/api/risks':[risk], '/api/tbms':[], '/api/actions':[{'id':9,'status':'OPEN','issue_text':'난간 미설치','contractor_name':'테스트건설','author_name':'관리자'}],
 '/api/custom/forms':[], '/api/history':[{'id':11,'kind':'risk','record_date':'2026-11-26','site_name':'테스트 현장','title':'철근 조립','extra':'철근공사','detail':'추락','measure':'난간 설치'}], '/api/photo-library':[{'id':12,'record_type':'tbm','record_id':9,'site_id':1,'site_name':'테스트 현장','source_title':'오전 TBM','source_date':'2026-11-26','created_at':'2026-11-26','original_name':'test.jpg','uploader_name':'테스트 담당자'}], '/api/photo-library/usage':{'total_count':1,'total_bytes':12345}, '/api/v7/weekly':[], '/api/v7/weekly/preview':[risk],
 '/api/v8/contractors/summary':[{'id':2,'name':'테스트건설','risk_count':1,'approval_status':'SUBMITTED','user_count':2,'tbm_count':0,'open_actions':1}],
 '/api/v16/approvers':{'site_id':1,'review_role':'SAFETY_MANAGER','safety_user_id':4,'safety_name':'안전관리자','director_user_id':5,'director_name':'현장소장','can_configure':role=='MANAGER','candidates':[{'id':4,'name':'안전관리자','role':'SAFETY_MANAGER'},{'id':5,'name':'현장소장','role':'SITE_DIRECTOR'}]},
 '/api/v16/contractor-approvals':{'site_id':1,'week_start':week,'companies':[company]},
 '/api/templates':[dict(risk,id=8,name='철근 작업 표준평가')], '/api/v17/site-accounts':[], '/api/v9/unassigned-records':[]}
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 page=browser.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,device_scale_factor=1)
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.clock.set_fixed_time(datetime(2026,11,26,4,0,tzinfo=timezone.utc))
 html=(root/'index.html').read_text()
 html=re.sub(r'<link rel="stylesheet" href="/([^?"]+)[^"]*">',lambda m:'<style>'+ (root/m[1]).read_text()+'</style>',html)
 html=re.sub(r'<script src="/([^?"]+)[^"]*"></script>',lambda m:'<script>'+ (root/m[1]).read_text()+'</script>',html)
 mockjs="window.__writes=[];window.__unknown=[];window.__mock="+json.dumps(d,ensure_ascii=False)+";window.fetch=async (url,opt={})=>{const p=String(url).split('?')[0];const data=window.__mock;if(opt.method&&opt.method!=='GET'){window.__writes.push([p,opt.body]);return {ok:true,json:async()=>({id:55,score:6,level:'높음',ids:[1]})}};if(!(p in data))window.__unknown.push(p);return {ok:true,json:async()=>data[p]??[]};};"
 html=html.replace('<head>','<head><script>'+mockjs+'</script>',1)
 page.set_content(html,wait_until='load');page.wait_for_selector('#app:not(.hidden)');page.wait_for_timeout(300)
 print('initial',page.locator('#pt').inner_text(),page.locator('#who').inner_text())
 page.locator('.v19-bottom [data-v19-page=weekly]').click();page.wait_for_timeout(600)
 def visible(sel):return page.locator(sel).is_visible()
 def checkmode(m):
  assert page.locator('#weekly').get_attribute('data-v20-mode')==m,(m,page.locator('#weekly').get_attribute('data-v20-mode'))
  for n in ['Write','Lookup','Compose','Document','Template']:assert visible('#v12Panel'+n)==(n.lower()==m),(n,m)
 def nooverflow():assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1'),page.evaluate('[document.documentElement.scrollWidth,innerWidth]')
 checkmode('write');assert not visible('#v16ApproverSetup') and not visible('#v16CompanyQueue') and not visible('#v12Focus') and not visible('.v12-document-sidebar');assert not visible('#rd');assert visible('#v20DateSummary');assert visible('#rf') and visible('#rs');assert page.locator('#rf').bounding_box()['x']<page.locator('#rs').bounding_box()['x'];assert page.locator('button[onclick="saveRisk()"]').evaluate('(e)=>getComputedStyle(e).position')=='static';nooverflow()
 page.screenshot(path=str(out/'v20_mobile_write.png'));page.locator('button[onclick="saveRisk()"]').scroll_into_view_if_needed();page.screenshot(path=str(out/'v20_mobile_write_bottom.png'));page.evaluate('scrollTo(0,0)')
 for width in [360,430,390]:
  page.set_viewport_size({'width':width,'height':844});page.wait_for_timeout(100);nooverflow();checkmode('write')
 page.locator('.v20-date-box summary').click();assert visible('#rd');page.locator('#rd').fill('2026-11-25');assert '11.25' in page.locator('#v20DateSummary').inner_text();page.locator('.v20-date-box summary').click()
 page.locator('.v15-template-launch').click();page.wait_for_timeout(300);checkmode('template');assert page.locator('.v15-template-card').first.is_visible();page.locator('[data-v22-use="8"]').click();page.wait_for_timeout(300);checkmode('write');assert page.locator('#rw').input_value()=='철근 조립';assert page.locator('#rf').input_value()=='2';assert page.locator('#rm').input_value()=='안전난간 설치'
 page.locator('#riskContractor').select_option('2');page.locator('#riskPhotos').set_input_files({'name':'test.jpg','mimeType':'image/jpeg','buffer':b'\xff\xd8\xff\xd9'});assert '1장 선택' in page.locator('#riskPhotos + .v19-photo-tools small').inner_text();page.locator('button[onclick="saveRisk()"]').click();page.wait_for_timeout(500);writes=page.evaluate('window.__writes');assert any(p=='/api/risks' for p,_ in writes) and any(p=='/api/photos' for p,_ in writes);print('risk payload',next(v for p,v in writes if p=='/api/risks'));
 page.locator('[data-v12-mode=lookup]').click();page.wait_for_timeout(400);checkmode('lookup');assert not visible('#v16CompanyQueue');nooverflow();page.locator('#v7_risk_lookup details summary').click();assert visible('#riskTable .v20-record-table');assert page.locator('#riskTable td[data-v20-label]').count()>0;nooverflow()
 page.locator('[data-v12-mode=compose]').click();page.wait_for_timeout(400);checkmode('compose');assert visible('#v16CompanyQueue') and not visible('#v16ApproverSetup');assert visible('#v7SubmitWeekly');nooverflow();page.screenshot(path=str(out/'v20_mobile_submit.png'),full_page=True)
 page.locator('#v12PanelCompose .v20-settings-link').click();page.wait_for_timeout(400);assert visible('#companies') and visible('#v16ApproverSetup');assert visible('#v16ConfigEditor');page.locator('#v16ConfigEditor summary').click();assert visible('#v18ReviewRole');nooverflow()
 page.locator('.v19-bottom [data-v19-page=weekly]').click();page.wait_for_timeout(300);page.locator('[data-v12-mode=document]').click();page.wait_for_timeout(300);checkmode('document');assert visible('#v12Focus') and not visible('#v16CompanyQueue');assert not visible('.v12-document-sidebar');page.locator('.v20-doc-list summary').click();assert visible('.v12-document-sidebar');nooverflow();page.locator('.v20-doc-list summary').click();page.locator('.v20-company-history > summary').click();assert visible('#v16CompanyQueue');page.locator('.v20-company-history > summary').click();page.screenshot(path=str(out/'v20_mobile_approval.png'))
 page.locator('.v19-bottom [data-v19-page=tbm]').click();page.wait_for_timeout(300);assert visible('#v7_tbm_write') and not visible('#v7_tbm_lookup') and not visible('#v12TbmApprovalsInline');nooverflow();page.screenshot(path=str(out/'v20_mobile_tbm.png'),full_page=True)
 page.evaluate("v8ActionTab('register')");page.wait_for_timeout(300);assert visible('#v8ActionForm') and not visible('.v14-action-results');nooverflow();page.screenshot(path=str(out/'v20_mobile_action.png'),full_page=True)
 page.evaluate("v8ActionTab('open')");page.wait_for_timeout(200);assert visible('.v14-action-results') and not visible('#v8ActionForm');nooverflow()
 page.evaluate("show('history')");page.wait_for_timeout(300);assert visible('#historyTable .v20-record-table');nooverflow()
 page.evaluate("show('library')");page.wait_for_timeout(300);assert visible('.v15-photo-origin');assert 'TBM' in page.locator('.v15-photo-origin').inner_text();page.locator('[data-v15-size=lg]').click();assert page.locator('#libraryResults').get_attribute('data-size')=='lg';nooverflow()
 # Test an assigned safety reviewer with a real-shaped pending document and a read-only author.
 pending={'id':21,'site_id':1,'week_start':week,'week_end':'2026-11-29','revision':1,'status':'PENDING','approval_stage':'SAFETY','review_role':'SAFETY_MANAGER','safety_user_id':4,'director_user_id':5,'safety_assignee_name':'안전관리자','director_assignee_name':'현장소장','submitted_by_name':'현장관리자','submitted_at':'2026-11-26T03:00:00Z','item_count':1}
 page.evaluate('''(record)=>{window.__mock['/api/v7/weekly']=[record];window.__mock['/api/v7/weekly/21/items']=window.__mock['/api/risks'];window.__mock['/api/v8/weekly/21/events']=[];window.__mock['/api/v8/weekly/21/revisions']=[];window.__mock['/api/v16/weekly/21/stages']={stages:[],contractor_approvals:[{contractor_name:'테스트건설',approved_by_name:'협력사 관리자',approved_at:'2026-11-26T02:00:00Z',status:'APPROVED'}],companies:[],safety_name:'안전관리자',director_name:'현장소장'};me.id=4;siteContext.role='SAFETY_MANAGER';window.__mock['/api/v16/approvers'].can_configure=false;}''',pending)
 page.evaluate("v12OpenWorkspace('document')");page.wait_for_timeout(500);page.evaluate('reviewUi.selectWeekly(21)');page.wait_for_selector('.v16-document-trail');checkmode('document');assert visible('.v16-step.current');assert page.locator('.v16-step.current').inner_text().find('안전관리자')>=0;assert page.locator('.v16-action-approve:visible').count()==1;assert not visible('#v12PanelDocument .v20-settings-link');nooverflow();page.evaluate('scrollTo(0,0)');page.locator('.v16-document-trail').scroll_into_view_if_needed();page.screenshot(path=str(out/'v20_mobile_pending.png'))
 page.evaluate("siteContext.role='USER';me.id=9;siteContext.company_required=true;siteContext.contractor_id=2;v12ShowMode('write')");page.wait_for_timeout(400);assert page.locator('#riskContractor').is_disabled();assert page.locator('#riskContractor').input_value()=='2';assert not visible('#v16ApproverSetup');page.evaluate("v12ShowMode('document')");page.wait_for_timeout(300);page.evaluate('reviewUi.selectWeekly(21)');page.wait_for_timeout(300);assert page.locator('.v16-action-approve:visible').count()==0;assert not visible('.v20-route-read');assert visible('.v16-document-trail');assert not visible('#v16ConfigEditor');nooverflow()
 page.evaluate("siteContext.role='MANAGER';me.id=3;siteContext.company_required=false;window.__mock['/api/v7/weekly']=[];window.__mock['/api/v16/approvers'].can_configure=true")
 page.set_viewport_size({'width':1280,'height':900});page.wait_for_timeout(300);page.evaluate("v12OpenWorkspace('write')");page.wait_for_timeout(400);assert visible('#v16ApproverSetup') and visible('#v16CompanyQueue') and visible('.v12-document-sidebar') and visible('#rd');assert not visible('.v19-bottom');nooverflow();page.screenshot(path=str(out/'v20_desktop.png'),full_page=False)
 print('unknown endpoints',page.evaluate('Array.from(new Set(window.__unknown))'),'errors',errors);assert not errors
 browser.close()
