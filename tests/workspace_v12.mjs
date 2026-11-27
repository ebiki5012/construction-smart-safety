import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const read=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
const html=read('public/index.html'),js=read('public/workspace-v12.js'),css=read('public/workspace-v12.css'),server=read('server.js');
new vm.Script(js,{filename:'workspace-v12.js'});
const main=html.split('<section id="weekly"')[1]?.split('<section id="tbm"')[0];
assert(main,'weekly workspace missing');
assert.match(html,/id="v12RiskNav" data-p="weekly"/,'one risk entry point required');
assert(!html.includes('id="riskSub"'),'duplicate risk sidebar menus must be removed');
assert(!html.includes('id="tbmSub"'),'duplicate TBM sidebar menus must be removed');
assert(!html.includes('id="actionSub"'),'duplicate corrective action sidebar menus must be removed');
for(const id of ['v12Focus','v12PanelDocument','v12PanelWrite','v12PanelLookup','v12PanelCompose','v12PanelTemplate','v10WeekPicker','v7WeeklyList','v7WeeklyDetails','v8WeeklyEvents','v7SubmitWeekly','v8ReadyWeekly','v11WeekVerdict','v10WeekStats','v10WeekCompanies']){
 assert(html.includes(`id="${id}"`),`required existing/new workflow control missing: ${id}`);
}
for(const mode of ['document','write','lookup','compose'])assert(main.includes(`data-v12-mode="${mode}"`),`missing task: ${mode}`);
assert(html.includes('/workspace-v12.css?v=')&&html.includes('/workspace-v12.js?v='),'versioned V12 assets must load');
assert(js.includes('window.v7RiskTab=function')&&js.includes('window.v7WeeklyTab=function'),'risk and weekly entry points must converge');
assert(js.includes('window.v8TbmApprovalTab=')&&js.includes('window.v12TbmTab='),'TBM review must be reachable from one page');
assert(js.includes('window.v8ActionTab=function'),'action page must have internal task controls');
assert(js.includes('approved_by_name')&&js.includes('submitted_by_name')&&js.includes('author_name'),'writer, submitter and approver must be visible');
assert(js.includes("record?.status==='PENDING'")&&js.includes('canApprove()'),'only pending managers can approve');
assert(js.includes('renderDraft()')&&js.includes('renderFocus(record,items)'),'draft and submitted documents must be distinct');
assert(css.includes('v12-main-layout')&&css.includes('v12-accountability')&&css.includes('@media(max-width:650px)'),'responsive master/detail missing');
assert(css.includes('#v9ApprovalRibbon{display:none!important}'),'duplicate approval controls must be hidden');
assert(server.includes("version:'26.0.0'")&&server.includes("ui:'responsive-layout-v26'"),'server version endpoint not updated');
console.log('PASS V12: one risk workspace, consolidated TBM/action navigation, canonical approval, writer/submitter/approver, mobile layout');
