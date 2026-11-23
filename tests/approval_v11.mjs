import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const read=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
const html=read('public/index.html'),js=read('public/approval-v11.js'),css=read('public/approval-v11.css'),server=read('server.js');
new vm.Script(js,{filename:'approval-v11.js'});
new vm.Script(html.match(/<script>([\s\S]*?)<\/script>/)[1],{filename:'index-inline.js'});
assert(html.includes('/approval-v11.js?v=')&&html.includes('/approval-v11.css?v='),'new approval assets missing');
assert(html.includes('id="v11WeekVerdict"')&&html.includes('V15 · 사용자·사진·표준평가 개선'),'week approval summary and version missing');
assert(js.includes('PENDING:')&&js.includes('APPROVED:')&&js.includes('REJECTED:')&&js.includes('CANCELLED:'),'all document statuses must have a label');
assert(js.includes('approved_by_name')&&js.includes('approved_at'),'stamp must use recorded approver and date');
assert(js.includes('record.status === \'PENDING\'')&&js.includes('decideV7Weekly'),'approval action only for a pending document');
assert(html.includes("const snapshot=doc?await api('/api/v7/weekly/'+Number(doc.id)+'/items')"),'week snapshot must be fetched from approval document');
assert(html.includes("if(locked){")&&html.includes('상신된 위험요인')&&html.includes('결재 문서 포함'),'submitted document must supersede editable contractor ready counters');
assert(html.includes("$('v7SubmitWeekly').disabled=locked")&&html.includes("$('v8ReadyWeekly').disabled=locked"),'freeze draft buttons during pending/approved');
assert(html.includes('이미 처리되었거나 현재 결재 대기 상태가 아닙니다'),'stale approval must trigger reload');
assert(server.includes('const printSeal=')&&server.includes('approval-seal')&&server.includes('approved_at'),'print report needs status stamp');
assert(css.includes('.v11-stamp.document')&&css.includes('@media(max-width:650px)'),'desktop and mobile stamp styles required');
assert(server.includes("version:'15.0.0'"),'version endpoint must identify the deployed update');

// Rendering a stamp must never elevate a pending document to approved or show a stale approval action.
const ui={getSelectedWeekly(){return 9},showWeeklyDetails(){},filterWeekly(){},clearWeekly(){}};
const window={reviewUi:ui};
const context=vm.createContext({window,reviewUi:ui,document:{getElementById(){return null}},v8IsManager(){return true}});
new vm.Script(js).runInContext(context);
const pending=window.v11Approval.stamp({id:9,status:'PENDING',submitted_by_name:'원청 담당자'});
const approved=window.v11Approval.stamp({id:9,status:'APPROVED',approved_by_name:'현장소장',approved_at:'2026-11-17T01:00:00Z'});
assert.match(pending,/결재 대기/);assert.doesNotMatch(pending,/승인 완료/);
assert.match(approved,/승인 완료/);assert.match(approved,/현장소장/);assert.doesNotMatch(approved,/결재 대기/);
console.log('PASS V11: canonical document status, visible seal, locked drafts, report stamp and safe decisions');
