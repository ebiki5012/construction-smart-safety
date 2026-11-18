import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const read=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
const html=read('public/index.html'),js=read('public/readability-v10.js'),css=read('public/readability-v10.css');
new vm.Script(js,{filename:'readability-v10.js'});
assert(html.includes('/readability-v10.css?v=')&&html.includes('/readability-v10.js?v='),'V10 assets must be loaded');
assert(html.includes('V12 · 위험성평가 통합 업무 화면'),'latest visible identifier missing');
assert(js.includes('reviewUi.showWeeklyDetails=function'),'must enhance existing review without losing actions');
assert(js.includes('v10-glance')&&js.includes('v10-document-risks'),'summary and hazard priority blocks missing');
assert(js.indexOf('v10-document-risks')<js.indexOf('v10-disclosure'),'hazards must be above secondary details');
assert(js.includes('weekPeriod')&&js.includes('approved_by_name')&&js.includes('approved_at'),'document identity / approval audit info missing');
assert(js.includes("openPhotos('risk'")&&js.includes("/api/v8/weekly/${Number(r.id)}/report"),'photo and PDF features must remain');
assert(js.includes('v10-audit')&&js.includes("byId('v8WeeklyEvents')")&&js.includes('const contents=audit.innerHTML'),'existing audit history must remain accessible');
assert(css.includes('font-size:15px!important')&&css.includes('.v10-risk-hazard>strong{font-size:16px'),'readability size adjustments missing');
assert(css.includes('.v10-glance{display:grid;grid-template-columns:repeat(3')&&css.includes('@media(max-width:560px)'),'responsive summary design missing');
console.log('PASS V10: key facts first, hazard/measure above expandable metadata, audit/photo/PDF preserved');
