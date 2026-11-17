import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const root=new URL('../public/',import.meta.url);
const read=name=>fs.readFileSync(new URL(name,root),'utf8');
const index=read('index.html'),admin=read('admin-center.html');
const client=read('design-v8.js'),adminClient=read('admin-v8.js');
const css=read('design-v8.css'),adminCss=read('admin-v8.css');

new vm.Script(client,{filename:'design-v8.js'});
new vm.Script(adminClient,{filename:'admin-v8.js'});
for(const name of ['design-v8.js','design-v8.css'])assert(index.includes('/'+name),'main HTML did not load '+name);
for(const name of ['admin-v8.js','admin-v8.css'])assert(admin.includes('/'+name),'admin HTML did not load '+name);
assert(index.includes('review-v7.js'),'existing weekly decision workflow must remain');
assert(index.includes('v10WeekPicker')&&index.includes('v7WeeklyDetails'),'existing weekly decision controls must remain');
assert(index.includes('riskPeriodStart')&&index.includes('tbmRange'),'existing period filters must remain');
assert(client.includes('window.renderV8RiskWeek')&&client.includes('window.v8ShowRisk'),'risk list/detail functionality missing');
assert(client.includes('window.renderRecordList')&&client.includes('window.v8ShowTbm'),'TBM list/detail functionality missing');
assert(client.includes('window.removeRecord')&&client.includes('v8RemovalReason'),'visible cleanup reason dialog missing');
assert(client.includes("method:'DELETE'")&&client.includes('JSON.stringify({reason})'),'reason must be sent to backend');
assert(client.includes('window.editRecord')&&client.includes('v8EditForm'),'edit modal missing');
assert(adminClient.includes('window.restore')&&adminClient.includes('v8AdminRestoreReason'),'admin restore reason missing');
assert(css.includes('.app>.side')&&css.includes('.app>main.main')&&css.includes('.v8-record-browser'),'dashboard layout rules missing');
assert(css.includes('grid-template-columns:minmax(265px,.78fr) minmax(0,1.25fr)'),'desktop master/detail grid missing');
assert(css.includes('@media(max-width:900px)')&&adminCss.includes('@media(max-width:820px)'),'responsive layout missing');

console.log('PASS V8: assets linked, screen interactions compiled, period/approval preserved, responsive layout and recovery modals');
