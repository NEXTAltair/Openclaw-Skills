import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const scripts = path.dirname(fileURLToPath(import.meta.url));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sis-boundary-'));
const mock = path.join(root, 'notionctl.mjs');
fs.writeFileSync(mock, `
import fs from 'node:fs';
const args = process.argv.slice(2);
const read = flag => args[args.indexOf(flag) + 1];
const apiPath = read('--path');
const body = args.includes('--body-json') ? JSON.parse(read('--body-json')) : null;
if (process.env.SIS_TEST_LOG) fs.appendFileSync(process.env.SIS_TEST_LOG, JSON.stringify({path:apiPath,body})+'\\n');
if (process.env.SIS_TEST_FAIL === '1') { console.log(JSON.stringify({ok:false,error:'fixture unavailable'})); process.exit(0); }
let result = {id: 'fixture-page',url:'https://example.invalid/page'};
if (apiPath.includes('/query')) result = {results:[]};
if (apiPath.includes('/children')) result = {results:[],has_more:false};
if (apiPath.includes('/databases/')) result = {id:'fixture-db',data_sources:[{id:'fixture-ds'}]};
console.log(JSON.stringify({ok:true,result}));
`);
function run(name, args = [], input = '', env = {}) {
  const childEnv = { ...process.env };
  for (const key of Object.keys(childEnv)) {
    if (key.startsWith('NOTION_') || key.startsWith('SIS_')) delete childEnv[key];
  }
  return spawnSync(process.execPath, [path.join(scripts, name + '.js'), ...args], {
    encoding: 'utf8', input, timeout: 10000,
    env: { ...childEnv, NOTIONCTL_PATH: mock, ...env },
  });
}
const parse = result => JSON.parse(result.stdout);
test('explicit ambient pause does not contact Notion or alter an existing stage', () => {
  const workspace = path.join(root, 'disabled');
  const dir = path.join(workspace, 'memory/soul-in-sapphire');
  fs.mkdirSync(dir, {recursive:true});
  const file = path.join(dir, 'ambient-recall.json');
  fs.writeFileSync(file, 'preserve me');
  const log = path.join(root, 'disabled-api.log');
  const env = { SIS_TEST_LOG:log, SIS_TEST_FAIL:'1', SIS_AMBIENT_RECALL:'0' };
  assert.equal(parse(run('stage_ambient_recall',['--workspace',workspace], '', env)).status,'disabled');
  assert.equal(parse(run('read_ambient_recall',['--file',file], '', env)).status,'disabled');
  assert.equal(fs.readFileSync(file,'utf8'),'preserve me');
  assert.equal(fs.existsSync(log),false);
});
test('Notion memory write and search stay active independently of ambient settings', () => {
  const bad = run('stage_ambient_recall',[], '', {SIS_AMBIENT_RECALL:'true'});
  assert.notEqual(bad.status,0);
  assert.match(bad.stderr,/must be 0 or 1/);
  const log = path.join(root,'ltm.log');
  const env = {SIS_AMBIENT_RECALL:'broken',SIS_TEST_LOG:log};
  const found = run('ltm_search',['--query','fixture','--mem-dsid','ds','--mem-dbid','db'],'',env);
  assert.equal(found.status,0,found.stderr);
  assert.equal(parse(found).ok,true);
  const written = run('ltm_write',['--mem-dsid','ds','--mem-dbid','db'],
    JSON.stringify({title:'A remembered experience',content:'I felt relieved after the repair.',tags:['relief']}),env);
  assert.equal(written.status,0,written.stderr);
  const calls = fs.readFileSync(log,'utf8').trim().split('\n').map(JSON.parse);
  const page = calls.find(x=>x.path.endsWith('/pages'));
  assert.equal(page.body.properties.Tags.multi_select[0].name,'relief');
  assert.match(page.body.properties.Content.rich_text[0].text.content,/felt relieved/);
});
test('setup preserves all five Notion memory and self-data databases by default', () => {
  const log = path.join(root,'setup.log');
  const result = run('setup_ltm',['--parent','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','--base','Fixture','--yes'],'',
    {SIS_TEST_LOG:log});
  assert.equal(result.status,0,result.stderr);
  const titles = fs.readFileSync(log,'utf8').trim().split('\n').map(JSON.parse)
    .filter(x=>x.path.endsWith('/databases')).map(x=>x.body.title[0].text.content);
  assert.deepEqual(titles,['Fixture-mem','Fixture-events','Fixture-emotions','Fixture-state','Fixture-journal']);
});
test('Notion failure is an error, not successful ambient staging', () => {
  const result = run('stage_ambient_recall', ['--workspace',path.join(root,'error'),'--force-roll','5','--mem-dsid','ds','--mem-dbid','db'],
    '',{SIS_AMBIENT_RECALL:'1',SIS_TEST_FAIL:'1'});
  assert.notEqual(result.status,0,result.stderr);
  assert.equal(parse(result).ok,false);
  assert.equal(parse(result).status,'error');
  assert.equal(parse(result).staged,false);
});
test('preview, staging, reading and explicit consumption are distinct', () => {
  const workspace = path.join(root,'ambient');
  fs.mkdirSync(workspace,{recursive:true});
  fs.writeFileSync(path.join(workspace,'DREAMS.md'),'# Dream\n\nA grounded fixture reflection.\n');
  const env = {}; // Ambient recall remains enabled without any opt-in flag.
  const args = ['--workspace',workspace,'--force-roll','6'];
  const preview = run('stage_ambient_recall',[...args,'--dry-run'],'',env);
  assert.equal(preview.status,0,preview.stderr);
  assert.equal(parse(preview).status,'preview');
  assert.equal(parse(preview).staged,false);
  assert.equal(fs.existsSync(parse(preview).stagedFile),false);
  const staged = parse(run('stage_ambient_recall',args,'',env));
  assert.equal(staged.status,'staged');
  assert.equal(staged.consumed,false);
  const file = staged.stagedFile;
  const read = parse(run('read_ambient_recall',['--file',file],'',env));
  assert.equal(read.status,'available');
  assert.equal(fs.existsSync(file+'.consumption.json'),false);
  const wrong = run('read_ambient_recall',['--file',file,'--ack','wrong','--used-in','fixture:turn'],'',env);
  assert.notEqual(wrong.status,0);
  const ackArgs = ['--file',file,'--ack',read.recall.id,'--used-in','fixture:turn'];
  const ack = parse(run('read_ambient_recall',ackArgs,'',env));
  assert.equal(ack.consumed,true);
  assert.equal(ack.receipt.used_in,'fixture:turn');
  assert.deepEqual(parse(run('read_ambient_recall',ackArgs,'',env)).receipt,ack.receipt);
  assert.equal(parse(run('read_ambient_recall',['--file',file],'',env)).recall,null);
  const next = {...read.recall,id:'replacement'};
  fs.writeFileSync(file,JSON.stringify(next));
  assert.notEqual(run('read_ambient_recall',ackArgs,'',env).status,0);
  assert.equal(parse(run('read_ambient_recall',['--file',file],'',env)).consumed,false);
  next.expires_at = '2000-01-01T00:00:00Z';
  fs.writeFileSync(file,JSON.stringify(next));
  assert.equal(parse(run('read_ambient_recall',['--file',file],'',env)).status,'expired');
  assert.notEqual(run('read_ambient_recall',['--file',file,'--ack','replacement','--used-in','fixture:turn'],'',env).status,0);
});
test('historical candidate without an id has a stable consumable identity', () => {
  const file = path.join(root,'historical.json');
  fs.writeFileSync(file,JSON.stringify({version:1,kind:'ambient_recall',content:'retained',expires_at:'2099-01-01T00:00:00Z'}));
  const env = {SIS_AMBIENT_RECALL:'1'};
  const first = parse(run('read_ambient_recall',['--file',file],'',env));
  const second = parse(run('read_ambient_recall',['--file',file],'',env));
  assert.equal(first.recall.id,second.recall.id);
  assert.equal(parse(run('read_ambient_recall',['--file',file,'--ack',first.recall.id,'--used-in','fixture:old'],'',env)).consumed,true);
});
test('state/emotion relations and subjective journal survive an invalid ambient setting and Notion failures remain failures', () => {
  const log = path.join(root,'self.log');
  const env = {SIS_TEST_LOG:log,SIS_AMBIENT_RECALL:'broken'};
  const payload = JSON.stringify({event:{title:'Fixture',context:'I wondered whether my wording felt rejecting.'},
    emotions:[{axis:'stress',level:6,comment:'I worried, tentatively.'}],state:{reason:'My interpretation is uncertain.'}});
  const args = ['--events-dbid','events','--emotions-dbid','emotions','--state-dbid','state','--state-dsid','ds','--payload-json',payload];
  const state = run('emostate_tick',args,'',env);
  assert.equal(state.status,0,state.stderr);
  assert.equal(parse(state).ok,true);
  const journal = run('journal_write',['--journal-dbid','journal'],JSON.stringify({body:'I felt uncertain, then settled; the question remains.'}),env);
  assert.equal(journal.status,0,journal.stderr);
  const writes = fs.readFileSync(log,'utf8').trim().split('\n').map(JSON.parse).filter(x=>x.path.endsWith('/pages'));
  assert.equal(writes.length,4);
  assert.equal(writes[1].body.properties.event.relation[0].id,'fixture-page');
  assert.equal(writes[2].body.properties.event.relation[0].id,'fixture-page');
  assert.match(writes[3].body.properties.body.rich_text[0].text.content,/I felt uncertain/);
  assert.notEqual(run('emostate_tick',args,'',{...env,SIS_TEST_FAIL:'1'}).status,0);
  const failedJournal = run('journal_write',['--journal-dbid','journal'],'{"body":"subjective fixture"}',{...env,SIS_TEST_FAIL:'1'});
  assert.notEqual(failedJournal.status,0);
  assert.doesNotMatch(failedJournal.stdout,/"ok":\s*true/);
});
