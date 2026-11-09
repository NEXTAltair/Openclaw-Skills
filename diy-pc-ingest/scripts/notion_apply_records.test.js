const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { run, idsFromArgs, parseArgs, notionctlPath } = require('./notion_apply_records');
const ids = idsFromArgs(Object.fromEntries(['storage', 'pcconfig', 'enclosure', 'pcinput'].flatMap(t => [[`${t}-dsid`, t], [`${t}-dbid`, `${t}-db`]])));
const schema = Object.fromEntries(Object.entries({ Name: 'title', 名前: 'title', 型番: 'rich_text', Serial: 'rich_text', シリアル: 'rich_text', メモ: 'rich_text', 購入日: 'date', '価格(円)': 'number', 現在の接続先PC: 'select', 取り外し表示名: 'rich_text', PC: 'select', Category: 'select', 'Purchase Date': 'date', 'Purchase Vendor': 'rich_text', 'Purchase Price': 'number', Spec: 'rich_text', Installed: 'checkbox', Active: 'checkbox', Notes: 'rich_text' }).map(([k, type]) => [k, { type }]));
function prop(k, v) {
  const type = schema[k].type;
  return { type, [type]: ['title', 'rich_text'].includes(type) ? [{ plain_text: v }] : type === 'date' ? { start: v } : type === 'select' ? { name: v } : v };
}
function row(id, ds, values, archived = false) { return { id, parent: { data_source_id: ds }, properties: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, prop(k, v)])), archived }; }
function mock(initial = [], failWrite = 0, badRead = false) {
  const rows = structuredClone(initial), calls = []; let writes = 0;
  function matches(r, f) {
    if (f.and) return f.and.every(x => matches(r, x));
    const p = r.properties[f.property], type = schema[f.property].type, rule = f[type];
    const value = ['title', 'rich_text'].includes(type) ? (p?.[type] || []).map(t => t.plain_text ?? t.text?.content ?? '').join('') : type === 'date' ? p?.date?.start : p?.[type];
    return rule.is_empty ? !value : value === rule.equals;
  }
  async function req(method, endpoint, body) {
    calls.push({ method, endpoint, body });
    if (method === 'GET' && endpoint.startsWith('/data_sources/')) return { properties: schema };
    if (endpoint.endsWith('/query')) { const ds = endpoint.split('/')[2]; return { results: structuredClone(rows.filter(r => r.parent.data_source_id === ds && !r.archived && matches(r, body.filter))), has_more: false }; }
    if (method === 'GET') { const found = rows.find(r => r.id === endpoint.split('/')[2]); return structuredClone(badRead && writes ? { ...found, properties: {} } : found); }
    writes++;
    if (writes === failWrite) return { isError: true, content: [{ text: 'user rejected MCP tool call' }] };
    let r = method === 'POST' ? row(`new-${rows.length}`, body.parent.data_source_id, {}) : rows.find(r => r.id === endpoint.split('/')[2]);
    if (method === 'POST') rows.push(r);
    for (const [k, v] of Object.entries(body.properties || {})) r.properties[k] = { type: schema[k].type, ...v };
    if (body.archived) r.archived = true;
    return structuredClone(r);
  }
  return { req, rows, calls, writes: () => writes };
}
const storage = (serial, extra = {}) => ({ target: 'storage', properties: { Name: 'Example SSD', シリアル: serial, ...extra } });
test('plan defaults and boolean flags reject conflicting/unknown modes', () => {
  assert.deepEqual(parseArgs(['node', 'script', '--plan', '--storage-dsid', 's']), { plan: true, 'storage-dsid': 's' });
  assert.equal(parseArgs(['node', 'script', '--notionctl-path', '/another/root/notionctl.mjs'])['notionctl-path'], '/another/root/notionctl.mjs');
  assert.throws(() => parseArgs(['node', 'script', '--plan', '--apply']));
  assert.throws(() => parseArgs(['node', 'script', '--preview']));
});
test('preview create/update/direct/archive/mirror issues zero writes', async () => {
  const m = mock([row('old', 'storage', { Name: 'Old', シリアル: 'old' }), row('archive', 'storage', { Name: 'Archive', シリアル: 'archive' })]);
  const r = await run([storage('new', { 現在の接続先PC: 'Test PC', 購入日: '2026-01-01' }), { ...storage('old', { メモ: 'memo' }) }, { target: 'storage', page_id: 'old', properties: { メモ: 'direct' } }, { target: 'storage', page_id: 'archive', archive: true }, { ...storage('mirror', { 現在の接続先PC: 'Test PC', 購入日: '2026-01-01' }), mirror_to_pcconfig: true }], ids, 'plan', m.req);
  assert.equal(r.ok, true); assert.equal(m.writes(), 0);
  assert.deepEqual(r.results.map(x => x.action), ['create', 'update', 'update', 'archive', 'create', 'create']);
  assert.equal(r.results[1].before.メモ, ''); assert.equal(r.results[1].after.メモ, 'memo');
});
test('apply/readback and repeated input/run skip instead of duplicate create', async () => {
  const m = mock(); const records = [storage('one'), storage('one')];
  const first = await run(records, ids, 'apply', m.req);
  assert.equal(first.summary.created, 1); assert.equal(first.summary.skipped, 1);
  const second = await run(records, ids, 'apply', m.req);
  assert.equal(second.summary.skipped, 2); assert.equal(m.writes(), 1);
});
test('duplicate key blocks whole batch without writes', async () => {
  const m = mock([row('a', 'storage', { Name: 'A', シリアル: 'same' }), row('b', 'storage', { Name: 'B', シリアル: 'same' })]);
  const r = await run([storage('new'), storage('same')], ids, 'apply', m.req);
  assert.equal(r.summary.blocked, 1); assert.equal(r.summary.not_executed, 1); assert.equal(m.writes(), 0);
  assert.deepEqual(r.results[1].matches, ['a', 'b']);
});
test('missing keys/mirror fields and unknown properties block preflight', async () => {
  for (const rec of [{ target: 'storage', properties: { メモ: 'No identifying name' } }, { ...storage('s'), mirror_to_pcconfig: true }, storage('s', { Unknown: 3 }), { target: 'pcconfig', title: 'No date' }]) {
    const m = mock(); const r = await run([rec], ids, 'apply', m.req);
    assert.equal(r.ok, false); assert.equal(m.writes(), 0);
  }
});
test('rejection preserves partial success and stops remaining writes; replan only missing work', async () => {
  const m = mock([], 2); const records = [storage('one'), storage('two'), storage('three')];
  const r = await run(records, ids, 'apply', m.req);
  assert.deepEqual(r.results.map(x => x.status), ['applied', 'failed', 'not_executed']);
  assert.equal(r.summary.created, 1); assert.equal(m.writes(), 2);
  const plan = await run(records, ids, 'plan', m.req);
  assert.deepEqual(plan.results.map(x => x.action), ['skip', 'create', 'create']);
});
test('read-back mismatch is not success and prevents later writes', async () => {
  const m = mock([], 0, true); const r = await run([storage('s'), storage('t')], ids, 'apply', m.req);
  assert.equal(r.summary.created, 0); assert.equal(r.summary.failed, 1); assert.equal(r.summary.not_executed, 1); assert.equal(m.writes(), 1);
});
test('overwrite identical values and already archived page are skips', async () => {
  const m = mock([row('same', 'storage', { Name: 'Example SSD', シリアル: 's' }), row('archived', 'storage', {}, true)]);
  const r = await run([{ ...storage('s'), overwrite: true }, { target: 'storage', page_id: 'archived', archive: true }], ids, 'apply', m.req);
  assert.equal(r.summary.skipped, 2); assert.equal(m.writes(), 0);
});
test('archive apply is verified and wrong target page is blocked', async () => {
  const m = mock([row('a', 'storage', { シリアル: 's' }), row('b', 'pcconfig', {})]);
  assert.equal((await run([{ target: 'storage', page_id: 'a', archive: true }], ids, 'apply', m.req)).summary.archived, 1);
  assert.equal((await run([{ target: 'storage', page_id: 'b', archive: true }], ids, 'apply', m.req)).summary.blocked, 1);
  assert.equal(m.writes(), 1);
});
test('storage fallback does not join another serial or ignore date mismatch', async () => {
  for (const values of [{ シリアル: 'other' }, { シリアル: '', 購入日: '2025-01-01' }]) {
    const m = mock([row('old', 'storage', { Name: 'Example SSD', ...values })]);
    const r = await run([storage('new', { 購入日: '2026-01-01' })], ids, 'plan', m.req);
    assert.equal(r.results[0].action, 'create');
  }
});
test('missing/blank/unknown serials create provisional storage and repeated runs skip', async () => {
  for (const serial of [undefined, null, '', '  ', '不明', 'シリアル不明', 'UNKNOWN', 'n/a', '-']) {
    const m = mock(); const rec = storage(serial, { 購入日: '2026-10-05', '価格(円)': 5000 });
    const preview = await run([rec], ids, 'plan', m.req);
    assert.equal(preview.ok, true); assert.equal(m.writes(), 0);
    assert.equal(preview.results[0].key.シリアル, null);
    assert.equal(Object.hasOwn(preview.results[0].body.properties, 'シリアル'), false);
    assert.equal((await run([rec], ids, 'apply', m.req)).summary.created, 1);
    assert.equal((await run([rec], ids, 'apply', m.req)).summary.skipped, 1);
    assert.equal(m.writes(), 1);
  }
});
test('a later real serial fills the provisional storage row without a duplicate', async () => {
  const m = mock(); const purchase = { 購入日: '2026-10-05', '価格(円)': 5000 };
  const first = await run([storage(undefined, purchase)], ids, 'apply', m.req);
  const next = await run([storage(' REAL-001 ', { ...purchase, メモ: 'serial now available' })], ids, 'apply', m.req);
  assert.equal(next.summary.updated, 1); assert.equal(next.results[0].id, first.results[0].id);
  assert.equal(m.rows.length, 1);
  assert.equal(m.rows[0].properties.シリアル.rich_text[0].text.content, 'REAL-001');
  assert.equal((await run([storage('REAL-001', purchase)], ids, 'apply', m.req)).summary.skipped, 1);
});
test('legacy unknown-serial labels are post-filled rather than used as common IDs', async () => {
  const m = mock([row('legacy', 'storage', { Name: 'Example SSD', シリアル: '不明' }), row('unrelated', 'storage', { Name: 'Other SSD', シリアル: '不明' })]);
  const r = await run([storage('REAL-001')], ids, 'apply', m.req);
  assert.equal(r.summary.updated, 1); assert.equal(r.results[0].id, 'legacy');
  assert.equal(m.rows[1].properties.シリアル.rich_text[0].plain_text, '不明');
});
test('provisional storage never auto-joins a known serial or a mismatched purchase', async () => {
  for (const values of [{ シリアル: 'OTHER-001' }, { シリアル: '', 購入日: '2025-01-01' }, { シリアル: '', '価格(円)': 9000 }]) {
    const m = mock([row('old', 'storage', { Name: 'Example SSD', 購入日: '2026-10-05', '価格(円)': 5000, ...values })]);
    const r = await run([storage(undefined, { 購入日: '2026-10-05', '価格(円)': 5000 })], ids, 'plan', m.req);
    assert.equal(r.results[0].action, 'create'); assert.equal(m.writes(), 0);
  }
});
test('duplicate provisional rows and repeated serial-less batch identities block all writes', async () => {
  const m = mock([row('a', 'storage', { Name: 'Example SSD' }), row('b', 'storage', { Name: 'Example SSD', シリアル: 'unknown' })]);
  const r = await run([storage(undefined)], ids, 'apply', m.req);
  assert.equal(r.summary.blocked, 1); assert.equal(m.writes(), 0);
  assert.deepEqual(r.results[0].matches, ['a', 'b']);
  const empty = mock();
  const duplicate = await run([storage(undefined), storage('不明')], ids, 'apply', empty.req);
  assert.equal(duplicate.summary.blocked, 2); assert.equal(empty.writes(), 0);
});
test('distinct purchase identities can create two serial-less devices in one batch', async () => {
  const m = mock();
  const r = await run([storage(undefined, { 購入日: '2026-10-04' }), storage(undefined, { 購入日: '2026-10-05' })], ids, 'apply', m.req);
  assert.equal(r.summary.created, 2); assert.equal(m.rows.length, 2);
});
test('partially specified provisional identities cannot silently merge batch units', async () => {
  for (const records of [[storage(undefined), storage(undefined, { 購入日: '2026-10-05' })], [storage(undefined, { 購入日: '2026-10-05' }), storage(undefined)]]) {
    const m = mock(); const r = await run(records, ids, 'apply', m.req);
    assert.equal(r.summary.blocked, 2); assert.equal(m.writes(), 0);
  }
});
test('unknown serial input does not erase a known direct-page serial, even with overwrite', async () => {
  const m = mock([row('known', 'storage', { Name: 'Example SSD', シリアル: 'REAL-001' })]);
  const r = await run([{ target: 'storage', page_id: 'known', overwrite: true, properties: { シリアル: '不明', メモ: 'additional info' } }], ids, 'apply', m.req);
  assert.equal(r.summary.updated, 1); assert.equal(m.rows[0].properties.シリアル.rich_text[0].plain_text, 'REAL-001');
  const cleared = await run([{ target: 'storage', page_id: 'known', overwrite: true, properties: { シリアル: null } }], ids, 'apply', m.req);
  assert.equal(cleared.summary.updated, 1); assert.equal(m.rows[0].properties.シリアル.rich_text[0].text.content, '');
});
test('PCInput permits unknown Serial and later fills the same model/name row', async () => {
  const m = mock(); const rec = { target: 'pcinput', properties: { 名前: 'Example keyboard', 型番: 'KB-01', 購入日: '2026-10-05' } };
  const first = await run([rec], ids, 'apply', m.req);
  assert.equal(first.summary.created, 1);
  assert.equal((await run([rec], ids, 'apply', m.req)).summary.skipped, 1);
  const filled = await run([{ ...rec, properties: { ...rec.properties, Serial: 'KB-SERIAL' } }], ids, 'apply', m.req);
  assert.equal(filled.summary.updated, 1); assert.equal(filled.results[0].id, first.results[0].id);
  assert.equal(m.rows.length, 1);
});
test('unknown-serial storage mirrors leave Spec empty so later serial post-fill works', async () => {
  const m = mock(); const details = { 現在の接続先PC: 'Test PC', 購入日: '2026-10-05' };
  const rec = { ...storage(undefined, details), mirror_to_pcconfig: true };
  assert.equal((await run([rec], ids, 'apply', m.req)).summary.created, 2);
  assert.equal(m.rows.find(r => r.parent.data_source_id === 'pcconfig').properties.Spec, undefined);
  const filled = await run([{ ...storage('REAL-001', details), mirror_to_pcconfig: true }], ids, 'apply', m.req);
  assert.equal(filled.summary.updated, 2);
  assert.equal(m.rows.find(r => r.parent.data_source_id === 'pcconfig').properties.Spec.rich_text[0].text.content, 'S/N: REAL-001');
});
test('mirror is idempotent and mirror failure retains primary success', async () => {
  const rec = { ...storage('s', { 現在の接続先PC: 'Test PC', 購入日: '2026-01-01' }), mirror_to_pcconfig: true };
  const m = mock([], 2); const first = await run([rec], ids, 'apply', m.req);
  assert.deepEqual(first.results.map(x => x.status), ['applied', 'failed']);
  const next = await run([rec], ids, 'apply', m.req);
  assert.deepEqual(next.results.map(x => x.status), ['skipped', 'applied']);
  assert.equal((await run([rec], ids, 'apply', m.req)).summary.skipped, 2);
});
test('pagination finds duplicates beyond first page and incomplete results block', async () => {
  const m = mock(); let queries = 0;
  const req = async (method, endpoint, body) => endpoint.endsWith('/query') ? (++queries === 1 ? { results: [row('a', 'storage', {})], has_more: true, next_cursor: 'next' } : { results: [row('b', 'storage', {})], has_more: false }) : m.req(method, endpoint, body);
  const r = await run([storage('s')], ids, 'apply', req);
  assert.equal(r.summary.blocked, 1); assert.equal(queries, 2); assert.equal(m.writes(), 0);
});
test('notionctl resolves unscoped, scoped sibling, scoped-to-root and explicit override', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'diy-deps-'));
  const rootDep = path.join(root, 'notion-api-automation/scripts/notionctl.mjs');
  fs.mkdirSync(path.dirname(rootDep), { recursive: true }); fs.writeFileSync(rootDep, '');
  assert.equal(notionctlPath(path.join(root, 'diy-pc-ingest/scripts'), ''), rootDep);
  assert.equal(notionctlPath(path.join(root, '@owner/diy-pc-ingest/scripts'), ''), rootDep);
  const scoped = path.join(root, '@owner/notion-api-automation/scripts/notionctl.mjs');
  fs.mkdirSync(path.dirname(scoped), { recursive: true }); fs.writeFileSync(scoped, '');
  assert.equal(notionctlPath(path.join(root, '@owner/diy-pc-ingest/scripts'), ''), scoped);
  assert.equal(notionctlPath('/absent', rootDep), rootDep);
  assert.throws(() => notionctlPath('/absent', path.join(root, 'missing')));
  assert.throws(() => notionctlPath('/absent', root), /not a file/);
  const separate = path.join(root, 'extra/group/notion/scripts/notionctl.mjs');
  fs.mkdirSync(path.dirname(separate), { recursive: true }); fs.writeFileSync(separate, '');
  assert.equal(notionctlPath(path.join(root, 'workspace/skills/group/diy-pc-ingest/scripts'), separate), separate);
});
test('CLI plan/dry-run/default use notionctl api contract without write calls; envelope rejection fails', () => {
  const { spawnSync } = require('node:child_process');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'diy-cli-'));
  const cli = path.join(root, 'notionctl.mjs'), log = path.join(root, 'requests.jsonl');
  fs.writeFileSync(cli, `import fs from 'node:fs';
    const a = process.argv.slice(2);
    if (a[0] !== 'api' || !a.includes('--compact')) process.exit(2);
    const method = a[a.indexOf('--method') + 1], endpoint = a[a.indexOf('--path') + 1];
    fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({method,endpoint})+'\\n');
    if (process.env.DIY_TEST_REJECT) { console.log(JSON.stringify({ok:true,isError:true})); }
    else if (method === 'GET' && endpoint.startsWith('/v1/data_sources/')) console.log(JSON.stringify({ok:true,result:{properties:${JSON.stringify(schema)}}}));
    else if (method === 'POST' && endpoint.endsWith('/query')) console.log(JSON.stringify({ok:true,result:{results:[],has_more:false}}));
    else process.exit(3);
  `);
  for (const flags of [[], ['--plan'], ['--dry-run']]) {
    const r = spawnSync(process.execPath, [path.join(__dirname, 'notion_apply_records.js'), ...flags, '--storage-dsid', 'storage', '--storage-dbid', 'storage-db'], { input: JSON.stringify(storage('fixture')), encoding: 'utf8', env: { ...process.env, NOTIONCTL_PATH: cli } });
    assert.equal(r.status, 0, r.stderr); assert.equal(JSON.parse(r.stdout).mode, 'plan');
  }
  const calls = fs.readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse);
  assert.ok(calls.every(c => c.method === 'GET' || (c.method === 'POST' && c.endpoint.endsWith('/query'))));
  const explicit = spawnSync(process.execPath, [path.join(__dirname, 'notion_apply_records.js'), '--plan', '--notionctl-path', cli, '--storage-dsid', 'storage', '--storage-dbid', 'storage-db'], { input: JSON.stringify(storage(undefined)), encoding: 'utf8', env: { ...process.env, NOTIONCTL_PATH: path.join(root, 'missing') } });
  assert.equal(explicit.status, 0, explicit.stderr);
  assert.equal(JSON.parse(explicit.stdout).results[0].key.シリアル, null);
  assert.equal(Object.hasOwn(JSON.parse(explicit.stdout).results[0].body.properties, 'シリアル'), false);
  const r = spawnSync(process.execPath, [path.join(__dirname, 'notion_apply_records.js'), '--apply', '--storage-dsid', 'storage', '--storage-dbid', 'storage-db'], { input: JSON.stringify(storage('fixture')), encoding: 'utf8', env: { ...process.env, NOTIONCTL_PATH: cli, DIY_TEST_REJECT: '1' } });
  assert.equal(r.status, 1); assert.equal(JSON.parse(r.stdout).summary.blocked, 1);
});
