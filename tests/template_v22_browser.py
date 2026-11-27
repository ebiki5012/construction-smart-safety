from playwright.sync_api import sync_playwright
from pathlib import Path
from urllib.parse import urlparse,parse_qs
import json,re
from datetime import datetime, timezone
root=Path(__file__).resolve().parents[1]/'public'
import os
out=Path(os.environ.get('V22_SCREENSHOT_DIR','/tmp/v22-screenshots'));out.mkdir(parents=True,exist_ok=True)
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
 '/api/templates':[dict(risk,id=8,name='철근 작업 표준평가'),dict(risk,id=9,name='과거 자료',archived_at='2026-11-25')], '/api/v17/site-accounts':[], '/api/v9/unassigned-records':[]}
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 page=browser.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,device_scale_factor=1)
 page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept())
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
 page.locator('.v15-template-launch').click();page.wait_for_selector('[data-v22-use="8"]');checkmode('template');nooverflow()
 assert page.locator('[data-v22-use="9"]').count()==0
 page.locator('[data-v22-edit="8"]').click();assert visible('#v22EditForm');page.locator('#v22Category').select_option('scaffold');page.locator('#v22EditSave').click();page.wait_for_timeout(250);assert any(p=='/api/templates/8' and json.loads(v)['category']=='scaffold' for p,v in page.evaluate('window.__writes'))
 page.locator('[data-v22-source=archived]').click();assert visible('[data-v22-restore="9"]');page.locator('[data-v22-restore="9"]').click();page.wait_for_timeout(250);assert any(p=='/api/templates/9/restore' for p,v in page.evaluate('window.__writes'))
 page.locator('[data-v22-source=examples]').click();page.locator('[data-v22-category=frame]').click();assert page.locator('.v22-card').count()==6;nooverflow()
 page.wait_for_timeout(1800);page.locator('#v12PanelTemplate').scroll_into_view_if_needed();page.screenshot(path=str(out/'v22_mobile_catalog.png'),full_page=False)
 page.locator('#v22Type').select_option('추락');assert page.locator('.v22-card').count()==2
 page.locator('#v15TemplateArea').select_option('철근 조립');assert page.locator('.v22-card').count()==1
 page.locator('.v22-preview summary').click();assert visible('.v22-preview p');page.locator('.v22-star').click();page.locator('[data-v22-source=favorites]').click();assert page.locator('.v22-card').count()==1
 page.locator('.v22-preview summary').click();page.locator('.v22-card').scroll_into_view_if_needed();page.screenshot(path=str(out/'v22_mobile_detail.png'))
 page.locator('[data-v22-use]').click();page.wait_for_timeout(350);checkmode('write');assert page.locator('#rw').input_value()=='철근 조립';assert page.locator('#rf').input_value()=='' and page.locator('#rs').input_value()=='';assert '기본 예시' in page.locator('#v15TemplateApplied').inner_text()
 page.locator('#riskContractor').select_option('2');page.locator('button[onclick="saveRisk()"]').click();page.wait_for_timeout(150);assert not any(p=='/api/risks' for p,v in page.evaluate('window.__writes'))
 page.locator('#rf').select_option('2');page.locator('#rs').select_option('3');page.locator('button[onclick="saveRisk()"]').click();page.wait_for_timeout(250);assert any(p=='/api/risks' and json.loads(v)['frequency']=='2' for p,v in page.evaluate('window.__writes'))
 page.evaluate('toTpl(11)');page.wait_for_selector('#v22EditForm');page.locator('#v22EditSave').click();page.wait_for_timeout(250);assert any(p=='/api/templates' and json.loads(v).get('source_risk_id')==11 for p,v in page.evaluate('window.__writes'))
 page.locator('.v15-template-launch').click();page.wait_for_timeout(300);page.locator('[data-v22-source=examples]').click();page.locator('[data-v22-category=frame]').click()
 for width in [360,390,430,1280]:
  page.set_viewport_size({'width':width,'height':850});page.wait_for_timeout(150);nooverflow()
 page.locator('#v12PanelTemplate').scroll_into_view_if_needed();page.screenshot(path=str(out/'v22_desktop_catalog.png'))
 page.evaluate("siteContext.role='USER';me.id=9;v12ShowMode('template')");page.wait_for_timeout(300);assert page.locator('[data-v22-edit]').count()==0;assert page.locator('[data-v22-source=archived]').count()==0
 print('V22 browser: category, type, work, preview, favorite, import, mandatory scores, create/edit/restore, mobile widths, role UI. Errors:',errors);assert not errors
 browser.close()
