// Regression checks for the V7 layout regression: views escaped <main>, and
// multiple child menus sharing data-p were highlighted simultaneously.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const riskMarkup = html.split('<section id="risk"')[1]?.split('<section id="weekly"')[0];
assert(riskMarkup, 'Risk/weekly sections missing');
const count = (s, re) => [...s.matchAll(re)].length;
assert.equal(count(riskMarkup, /<div\b/g), count(riskMarkup, /<\/div\s*>/g), 'Risk view has unbalanced div; following pages escape the right-hand workspace');
const mainMarkup = html.split('<main class="main">')[1]?.split('</main>')[0];
for (const id of ['dashboard', 'risk', 'weekly', 'tbm', 'tbmApprovals', 'action', 'admin']) {
  assert(mainMarkup?.includes(`<section id="${id}"`), `${id} must remain in main workspace`);
}

const scripts = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert(scripts);
const names = ['show','v7SelectSubMenu','v7RiskTab','v7TbmTab','v8ActionTab','v7WeeklyTab'];
const source = names.map(name => {
  const line = scripts.split('\n').find(s => s.startsWith(`function ${name}(`));
  assert(line, `Missing ${name}`);
  return line;
}).join('\n');

const cls = initial => {
  const set = new Set(initial);
  return {
    contains: value => set.has(value),
    add: value => set.add(value),
    remove: value => set.delete(value),
    toggle: (value, force) => {
      const enable = force === undefined ? !set.has(value) : !!force;
      if (enable) set.add(value); else set.delete(value);
      return enable;
    }
  };
};
const ids = new Map();
const $ = id => {
  if (!ids.has(id)) ids.set(id, {classList:cls([]),value:'',textContent:''});
  return ids.get(id);
};
const buttons = [
  'dashboard','risk','risk','weekly','weekly','tbm','tbm',
  'tbmApprovals','action','action','action','admin'
].map(p => ({dataset:{p},classList:cls([])}));
const pages = ['dashboard','risk','weekly','tbm','tbmApprovals','action','admin'].map(id => $(id));
const document = {querySelectorAll(selector) {
  if (selector === '.page') return pages;
  if (selector === '.nav button' || selector === '.nav button[data-p]') return buttons;
  const result = selector.match(/^\.nav button\[data-p="([a-zA-Z]+)"\]$/);
  return result ? buttons.filter(b => b.dataset.p === result[1]) : [];
}};

const sandbox = {
  document, $, me:{role:'ADMIN'}, sid:'1',siteContext:{role:'ADMIN'},v8WeeklyMode:'approval',v8ActionMode:'open',
  requireSite:() => true,v8IsManager:() => true,v7Monday:() => '2026-11-16',v10WeekMonday:x=>x,today:() => '2026-11-16',
  normalizeWorkspaceLayout:() => {},window:{reviewUi:null},
};
for (const f of ['loadDash','loadContractors','loadSettings','loadRisks','loadTbms','loadActions','loadV8RiskWeek',
  'loadV7WeeklyPreview','loadV7WeeklyList','v10LoadWeekBoard','loadV8TbmApprovals']) sandbox[f] = () => {};
vm.createContext(sandbox);
vm.runInContext(source, sandbox);

const cases = [
  ["v7TbmTab('write')",'tbm',0,'v7_tbm_write','v7_tbm_lookup'],
  ["v7TbmTab('lookup')",'tbm',1,'v7_tbm_lookup','v7_tbm_write'],
  ["v7RiskTab('write')",'risk',0,'v7_risk_write','v7_risk_lookup'],
  ["v7RiskTab('lookup')",'risk',1,'v7_risk_lookup','v7_risk_write'],
  ["v7WeeklyTab('approval')",'weekly',0],
  ["v7WeeklyTab('completed')",'weekly',1],
  ["v8ActionTab('register')",'action',0],
  ["v8ActionTab('open')",'action',1],
  ["v8ActionTab('verify')",'action',2],
];
for (const [call,kind,expected,visible,hidden] of cases) {
  vm.runInContext(call, sandbox);
  const matching = buttons.filter(b => b.dataset.p === kind);
  assert.equal(matching.filter(b => b.classList.contains('on')).length, 1, `${call}: multiple active menu buttons`);
  assert.equal(matching.findIndex(b => b.classList.contains('on')), expected, `${call}: wrong active menu button`);
  if (visible) assert(!$(visible).classList.contains('hidden'), `${call}: visible panel hidden`);
  if (hidden) assert($(hidden).classList.contains('hidden'), `${call}: inactive panel visible`);
}
console.log('PASS V7: balanced risk markup, views inside main, exclusive submenu selection');
