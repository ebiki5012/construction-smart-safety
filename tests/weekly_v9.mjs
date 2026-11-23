import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const read=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
const html=read('public/index.html'),js=read('public/weekly-v9.js'),css=read('public/weekly-v9.css'),server=read('server.js');
new vm.Script(js,{filename:'weekly-v9.js'});

for(const filename of ['weekly-v9.css','weekly-v9.js'])assert(html.includes('/'+filename),'V9 asset missing from HTML: '+filename);
for(const id of ['releaseVersion','v9ApprovalRibbon','v7WeekStart','v7CompanyFilter','v8MeetingDate','v8Attendees','v7MeetingNotes','v7WeeklyPreview','v7SubmitWeekly','v8ReadyWeekly','v7WeeklyList','v7WeeklyDetails'])assert(html.includes(`id="${id}"`),'existing V9 control missing: '+id);
assert.match(html,/V15 · 사용자·사진·표준평가 개선/,'version marker must be in HTML, not only external JS');
assert(html.includes('id="v12PanelCompose"')&&html.includes('id="v12PanelDocument"'),'draft and approval must be separate task panels in one workspace');
assert(html.includes('v9-compose-form-pane')&&html.includes('v9-compose-preview-pane'),'form and preview must be two independent panes');
assert(html.includes('원청 최종 결재')&&html.includes('주차당 통합 평가서 한 건'),'one document per week must be clear');
assert(js.includes('window.renderV7Preview')&&js.includes('v9-preview-company')&&js.includes('v9-preview-item'),'preview must be risk cards grouped by contractor');
assert(js.includes('reviewUi.showWeeklyDetails')&&js.includes('updateRibbon')&&js.includes('decideV7Weekly'),'approval state and action must be in clear ribbon');
assert(css.includes('.v9-compose-grid{display:grid;grid-template-columns:')&&css.includes('.v9-approval-ribbon'),'desktop side-by-side workspace missing');
assert(css.includes('@media(max-width:1100px)')&&css.includes('@media(max-width:620px)'),'responsive UI missing');
assert(server.includes("app.get('/api/version'")&&server.includes("version:'15.0.0'"),'deployment verification endpoint missing');
console.log('PASS V9: weekly form/preview split, contractor cards, visible final approval, version check');
