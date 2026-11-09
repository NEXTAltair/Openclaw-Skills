#!/usr/bin/env node
/**
 * Plan (default) or explicitly apply JSONL records to DIY_PC Notion tables (JS version).
 *
 * Deterministic upsert:
 * - reads JSONL from stdin
 * - upserts by configured keys
 * - patches only missing fields unless overwrite=true
 *
 * All Notion IDs are passed as CLI arguments (see the workspace AGENTS.md ## Tools section for values):
 *   --pcconfig-dsid / --pcconfig-dbid
 *   --pcinput-dsid  / --pcinput-dbid
 *   --storage-dsid  / --storage-dbid
 *   --enclosure-dsid / --enclosure-dbid
 *
 * Notion auth/API is delegated to notion-api-automation/scripts/notionctl.mjs
 * Notion version: NOTION_VERSION env or default 2025-09-03
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('node:child_process');

const DEFAULT_NOTION_VERSION = '2025-09-03';
const { isDeepStrictEqual } = require('node:util');
// Target schema: title_prop and key arrays are schema-derived constants.
const TARGET_SCHEMA = {
  pcconfig:  { title_prop: 'Name', key: ['Name', 'Purchase Date'] },
  pcinput:   { title_prop: '名前', key: ['型番', 'Serial', '名前'] },
  storage:   { title_prop: 'Name', key: ['シリアル'] },
  enclosure: { title_prop: 'Name', key: ['取り外し表示名', 'Name'] },
};

function parseArgs(argv) {
  const out = {};
  const flags = new Set(['plan', 'dry-run', 'apply']);
  const values = new Set(['notionctl-path', ...Object.keys(TARGET_SCHEMA).flatMap(t => [`${t}-dsid`, `${t}-dbid`])]);
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i].replace(/^--/, '');
    if (!argv[i].startsWith('--') || (!flags.has(k) && !values.has(k))) throw new Error(`Unknown argument: ${argv[i]}`);
    if (flags.has(k)) out[k] = true;
    else {
      if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error(`Missing value: --${k}`);
      out[k] = argv[++i];
    }
  }
  if (out.apply && (out.plan || out['dry-run'])) throw new Error('Choose plan/dry-run OR apply');
  return out;
}

function idsFromArgs(args) {
  const ids = {};
  for (const target of Object.keys(TARGET_SCHEMA)) {
    const dsid = args[`${target}-dsid`] || null;
    const dbid = args[`${target}-dbid`] || null;
    ids[target] = {
      data_source_id: dsid,
      database_id: dbid,
      ...TARGET_SCHEMA[target],
    };
  }
  return ids;
}

function notionVersion() {
  return (process.env.NOTION_VERSION || DEFAULT_NOTION_VERSION).trim();
}

function notionctlPath(here = __dirname, override = process.env.NOTIONCTL_PATH) {
  if (override) {
    const explicit = override.startsWith('~/') ? path.join(require('node:os').homedir(), override.slice(2)) : override;
    if (!fs.statSync(explicit, { throwIfNoEntry: false })?.isFile()) throw new Error('Configured notionctl path is not a file');
    return explicit;
  }
  const parent = path.resolve(here, '../..');
  const roots = [parent];
  if (path.basename(parent).startsWith('@')) roots.push(path.dirname(parent));
  const candidates = roots.map(root => path.join(root, 'notion-api-automation/scripts/notionctl.mjs'));
  const found = candidates.find(p => fs.existsSync(p));
  if (!found) throw new Error('notionctl not found; locate the installed notion skill and pass --notionctl-path or set NOTIONCTL_PATH');
  return found;
}

function safeEnv(extra = {}) {
  return { ...process.env, ...extra };
}

async function notionReq(method, apiPath, body, cliOverride = process.env.NOTIONCTL_PATH) {
  const p = String(apiPath).startsWith('/v1/') ? String(apiPath) : `/v1${String(apiPath).startsWith('/') ? '' : '/'}${String(apiPath)}`;
  const args = [
    notionctlPath(__dirname, cliOverride),
    'api',
    '--compact',
    '--method', String(method).toUpperCase(),
    '--path', p,
  ];
  if (body !== undefined && body !== null) args.push('--body-json', JSON.stringify(body));

  const env = safeEnv({ NOTION_VERSION: notionVersion() });

  let out = '';
  try {
    out = execFileSync(process.execPath, args, { encoding: 'utf-8', env, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (err) {
    const stdout = err?.stdout ? String(err.stdout).trim() : '';
    const stderr = err?.stderr ? String(err.stderr).trim() : '';
    if ([stdout, stderr].some(v => v.includes('Unknown command: api'))) {
      throw new Error('Incompatible notionctl: update notion-api-automation to a version supporting api');
    }
    // Do not echo command arguments or API bodies (they may contain private records).
    throw new Error('notionctl request failed or was rejected; cause unknown. Stop and inspect protected host diagnostics.');
  }
  const obj = out ? JSON.parse(out) : {};
  if (obj.isError || !obj.ok || obj.result?.isError || obj.result?.object === 'error') {
    throw new Error('notionctl returned an error or rejection; cause unknown. No alternate-route retry.');
  }
  return obj.result || {};
}

async function queryAll(req, ds, filter) {
  const rows = [];
  let cursor;
  const seen = new Set();
  for (let page = 0; page < 100; page++) {
    const j = await req('POST', `/data_sources/${ds}/query`, {
      page_size: 100, filter, ...(cursor ? { start_cursor: cursor } : {}),
    });
    if (!Array.isArray(j.results)) throw new Error('Invalid query response');
    rows.push(...j.results);
    if (!j.has_more) return rows;
    if (!j.next_cursor || seen.has(j.next_cursor)) throw new Error('Incomplete query pagination');
    cursor = j.next_cursor;
    seen.add(cursor);
  }
  throw new Error('Query limit exceeded; narrow input before writing');
}

function buildProp(schemaProp, value) {
  const t = schemaProp?.type;
  if (!t) return null;

  if (t === 'title') {
    return { title: [{ type: 'text', text: { content: String(value ?? '') } }] };
  }
  if (t === 'rich_text') {
    return { rich_text: [{ type: 'text', text: { content: String(value ?? '') } }] };
  }
  if (t === 'number') {
    if (value === null || value === undefined || value === '') return { number: null };
    if (!Number.isFinite(Number(value))) throw new Error('Invalid numeric value');
    return { number: Number(value) };
  }
  if (t === 'date') {
    if (!value) return { date: null };
    return { date: { start: String(value) } };
  }
  if (t === 'checkbox') {
    return { checkbox: Boolean(value) };
  }
  if (t === 'select') {
    if (value === null || value === undefined || String(value).trim() === '') return { select: null };
    return { select: { name: String(value) } };
  }
  if (t === 'status') {
    if (value === null || value === undefined || String(value).trim() === '') return { status: null };
    return { status: { name: String(value) } };
  }
  if (t === 'multi_select') {
    let names = [];
    if (Array.isArray(value)) names = value.map(v => String(v).trim()).filter(Boolean);
    else if (typeof value === 'string') names = value.split(',').map(v => v.trim()).filter(Boolean);
    return { multi_select: names.map(n => ({ name: n })) };
  }
  if (t === 'relation') {
    const ids = Array.isArray(value) ? value : [];
    return { relation: ids.map(pid => ({ id: pid })) };
  }
  if (t === 'url') {
    if (!value) return { url: null };
    return { url: String(value) };
  }

  return null;
}

function patchSkipsExisting(ep) {
  if (!ep) return false;
  const et = ep.type;
  if (et === 'rich_text' || et === 'title') {
    const arr = ep[et] || [];
    return arr.some(x => (x?.plain_text ?? x?.text?.content ?? '').trim());
  }
  if (et === 'number') return ep.number !== null && ep.number !== undefined;
  if (et === 'date') return Boolean(ep.date?.start);
  if (et === 'checkbox') return ep.checkbox === true;
  if (et === 'select') return Boolean(ep.select?.name);
  if (et === 'status') return Boolean(ep.status?.name);
  if (et === 'multi_select') return (ep.multi_select || []).length > 0;
  if (et === 'relation') return (ep.relation || []).length > 0;
  if (et === 'url') return Boolean(ep.url);
  return false;
}

function buildPatch(schema, incoming, existingProps, overwrite) {
  const out = {};
  const schProps = schema?.properties || {};

  for (const [k, v] of Object.entries(incoming || {})) {
    if (v === undefined) continue;
    if (!(k in schProps)) throw new Error(`Unknown property: ${k}`);
    const schemaProp = schProps[k];

    if (!overwrite) {
      const ep = existingProps?.[k];
      if (patchSkipsExisting(ep)) continue;
    }

    const built = buildProp(schemaProp, v);
    if (built === null) throw new Error(`Unsupported property: ${k}`);
    if (!isDeepStrictEqual(canonical(existingProps?.[k], schemaProp.type), canonical(built, schemaProp.type))) out[k] = built;
  }

  return out;
}

function canonical(prop, type) {
  if (type === 'title' || type === 'rich_text') return (prop?.[type] || []).map(x => x.plain_text ?? x.text?.content ?? '').join('');
  if (type === 'select' || type === 'status') return prop?.[type]?.name ?? null;
  if (type === 'relation') return (prop?.relation || []).map(x => x.id.replace(/-/g, '')).sort();
  if (type === 'multi_select') return (prop?.multi_select || []).map(x => x.name).sort();
  if (type === 'date') return prop?.date ? { start: prop.date.start, end: prop.date.end ?? null, time_zone: prop.date.time_zone ?? null } : null;
  return prop?.[type] ?? null;
}

function unique(rows, key) {
  if (rows.length > 1) {
    const err = new Error('Ambiguous key: multiple matching rows');
    err.details = { key, matches: rows.map(r => r.id) };
    throw err;
  }
  return rows[0] || null;
}

function serialProperty(target) {
  return target === 'storage' ? 'シリアル' : target === 'pcinput' ? 'Serial' : null;
}

function unknownSerial(value) {
  if (value === null || value === undefined) return true;
  const text = String(value).trim();
  return !text || /^(?:不明|シリアル不明|未確認|未取得|unknown|n\/a|-)$/i.test(text);
}

function hasValue(value) {
  return value !== null && value !== undefined && (typeof value !== 'string' || Boolean(value.trim()));
}

function keyFilter(schema, name, value) {
  const type = schema.properties?.[name]?.type;
  if (!['title', 'rich_text', 'date', 'number'].includes(type)) throw new Error(`Unsupported key schema: ${name}`);
  return { property: name, [type]: { equals: value } };
}

async function findExisting(ids, target, schema, propsIn, req = notionReq) {
  const cfg = ids[target];
  const filled = k => hasValue(propsIn[k]);
  const serial = serialProperty(target);
  const knownSerial = serial && !unknownSerial(propsIn[serial]);
  let keys;
  if (target === 'pcconfig') keys = cfg.key;
  else if (target === 'pcinput') keys = knownSerial ? cfg.key : ['型番', cfg.title_prop];
  else if (target === 'enclosure') keys = [filled('取り外し表示名') ? '取り外し表示名' : cfg.title_prop];
  else keys = knownSerial ? ['シリアル'] : [cfg.title_prop];
  if (!keys.every(filled)) {
    const err = new Error('Missing upsert key');
    err.details = { missing: keys.filter(k => !filled(k)) };
    throw err;
  }
  const key = Object.fromEntries(keys.map(k => [k, propsIn[k]]));
  if (!serial || knownSerial) {
    const filters = keys.map(k => keyFilter(schema, k, propsIn[k]));
    const exact = unique(await queryAll(req, cfg.data_source_id, filters.length === 1 ? filters[0] : { and: filters }), key);
    if (exact || !serial) return { row: exact, key };
  }
  if (!filled(cfg.title_prop)) return { row: null, key };
  // Match provisional identities only against other unknown-serial rows.
  // Query by descriptive fields, then filter locally so legacy "不明" labels
  // are not mistaken for real shared serials or for another physical device.
  const fallbackKeys = target === 'pcinput' ? ['型番', cfg.title_prop] : [cfg.title_prop];
  for (const k of ['購入日', '価格(円)']) if (filled(k)) fallbackKeys.push(k);
  const fallback = fallbackKeys.map(k => keyFilter(schema, k, propsIn[k]));
  const fallbackKey = knownSerial ? key : { ...Object.fromEntries(fallbackKeys.map(k => [k, propsIn[k]])), [serial]: null };
  const serialType = schema.properties?.[serial]?.type;
  if (serialType !== 'rich_text') throw new Error(`Unsupported serial schema: ${serial}`);
  const rows = await queryAll(req, cfg.data_source_id, fallback.length === 1 ? fallback[0] : { and: fallback });
  return { row: unique(rows.filter(r => unknownSerial(canonical(r.properties?.[serial], serialType))), fallbackKey), key: fallbackKey };
}

function requireIds(ids, target) {
  const t = ids[target] || {};
  const missing = [];
  if (!t.data_source_id) missing.push(`--${target}-dsid`);
  if (!t.database_id) missing.push(`--${target}-dbid`);
  if (missing.length) {
    throw new Error(`Missing Notion IDs: ${missing.join(', ')}. Check the workspace AGENTS.md ## Tools section for the values.`);
  }
}

// Every read/write is routed through this checked transport, including mocks.
async function checked(req, method, endpoint, body) {
  const r = await req(method, endpoint, body);
  if (!r || r.isError || r.ok === false || r.object === 'error') throw new Error('Request failed or rejected; cause unknown');
  return r;
}

function expandRecords(records) {
  return records.flatMap((rec, index) => {
    const primary = { ...rec, index, lane: 'primary' };
    if (!rec.mirror_to_pcconfig) return [primary];
    const p = rec.properties || {};
    const missing = ['現在の接続先PC', '購入日', 'Name'].filter(k => !p[k]);
    return [primary, {
      target: 'pcconfig', index, lane: 'mirror',
      invalid: rec.target !== 'storage' || rec.archive || rec.archived ? 'Invalid mirror request' : (missing.length ? 'Missing mirror fields' : null),
      missing,
      properties: { PC: p['現在の接続先PC'], Category: 'ストレージ', Name: p.Name,
        'Purchase Date': p['購入日'], 'Purchase Vendor': p['購入店'], 'Purchase Price': p['価格(円)'],
        Spec: unknownSerial(p['シリアル']) ? undefined : `S/N: ${String(p['シリアル']).trim()}`, Installed: true, Active: true, Notes: 'mirrored from storage' },
    }];
  });
}

async function planRecord(rec, ids, req) {
  if (rec.invalid) {
    const e = new Error(rec.invalid); e.details = { missing: rec.missing }; throw e;
  }
  if (!Object.hasOwn(TARGET_SCHEMA, rec.target)) throw new Error('Unknown target');
  requireIds(ids, rec.target);
  const cfg = ids[rec.target];
  const schema = await req('GET', `/data_sources/${cfg.data_source_id}`);
  if (!schema.properties) throw new Error('Invalid schema response');
  const props = { ...rec.properties };
  if (rec.title && !props[cfg.title_prop]) props[cfg.title_prop] = rec.title;
  const pageId = rec.page_id || rec.id;
  const serial = serialProperty(rec.target);
  if (serial && Object.hasOwn(props, serial)) {
    // Unknown is absence, not a shared identifier and not a request to erase a
    // known serial. Explicit null + overwrite on a verified page is still a clear.
    if (unknownSerial(props[serial]) && !(pageId && rec.overwrite && props[serial] === null)) delete props[serial];
    else if (props[serial] !== null) props[serial] = String(props[serial]).trim();
  }
  const archive = Boolean(rec.archive || rec.archived);
  let existing, key;
  if (pageId) {
    existing = await req('GET', `/pages/${pageId}`);
    const parent = existing.parent || {};
    const same = (a, b) => a && b && a.replace(/-/g, '') === b.replace(/-/g, '');
    if (!(same(parent.data_source_id, cfg.data_source_id) || same(parent.database_id, cfg.database_id))) throw new Error('Page does not belong to configured target');
    key = { page_id: pageId };
  } else {
    ({ row: existing, key } = await findExisting(ids, rec.target, schema, props, req));
  }
  if (archive && !existing) throw new Error('Cannot archive a missing row');
  if (existing && !existing.id) throw new Error('Invalid page response');
  if (existing?.archived && Object.keys(props).length) throw new Error('Cannot edit archived page');
  if (!existing && !props[cfg.title_prop]) throw new Error('Missing title for creation');
  const existingProps = { ...existing?.properties };
  if (serial && unknownSerial(canonical(existingProps[serial], 'rich_text'))) delete existingProps[serial];
  const patch = buildPatch(schema, props, existingProps, Boolean(rec.overwrite));
  const body = {};
  if (Object.keys(patch).length) body.properties = patch;
  if (archive && !existing.archived) body.archived = true;
  if (!existing) body.parent = { type: 'data_source_id', data_source_id: cfg.data_source_id };
  const action = !existing ? 'create' : body.archived ? 'archive' : Object.keys(patch).length ? 'update' : 'skip';
  const before = {}, after = {};
  for (const [k, v] of Object.entries(patch)) {
    before[k] = canonical(existing?.properties?.[k], schema.properties[k].type);
    after[k] = canonical(v, schema.properties[k].type);
  }
  if (archive) { before.archived = Boolean(existing?.archived); after.archived = true; }
  return { index: rec.index, lane: rec.lane, target: rec.target, key, action,
    id: existing?.id, url: existing?.url, before, after, body, schema };
}

function publicPlan(p) {
  const { schema, ...visible } = p;
  return visible;
}

async function run(records, ids, mode = 'plan', transport = notionReq) {
  if (!['plan', 'apply'].includes(mode)) throw new Error('Invalid mode');
  const req = (method, endpoint, body) => {
    if (mode === 'plan' && !(method === 'GET' || (method === 'POST' && /^\/data_sources\/[^/]+\/query$/.test(endpoint)))) throw new Error('Plan write blocked');
    return checked(transport, method, endpoint, body);
  };
  const expanded = expandRecords(records);
  const plans = [], results = [];
  // Preflight the whole batch before any mutation: ambiguity/missing fields block all writes.
  for (const rec of expanded) {
    try { plans.push(await planRecord(rec, ids, req)); }
    catch (e) { plans.push({ index: rec.index, lane: rec.lane, target: rec.target, action: 'blocked', error: e.message, ...e.details }); }
  }
  // Identical descriptions are not proof that two serial-less batch items are
  // the same device. Require distinct names/page IDs instead of silently folding
  // two physical units into the first newly created row.
  const provisional = new Map();
  for (const p of plans) {
    const serial = serialProperty(p.target);
    if (!serial || p.action === 'blocked' || !Object.hasOwn(p.key || {}, serial) || p.key[serial] !== null) continue;
    const names = p.target === 'pcinput' ? ['型番', '名前'] : ['Name'];
    const identity = JSON.stringify([p.target, ...names.map(k => p.key[k])]);
    const candidates = provisional.get(identity) || [];
    for (const earlier of candidates) {
      // A missing purchase detail cannot distinguish an undated item from a
      // dated one; only conflicting supplied details establish separate keys.
      if (['購入日', '価格(円)'].some(k => Object.hasOwn(earlier.key, k) && Object.hasOwn(p.key, k) && earlier.key[k] !== p.key[k])) continue;
      for (const item of [earlier, p]) {
        item.action = 'blocked';
        item.error = 'Repeated provisional identity; use distinct item names or verified page IDs';
      }
    }
    candidates.push(p);
    provisional.set(identity, candidates);
  }
  const blocked = plans.some(p => p.action === 'blocked');
  if (mode === 'plan' || blocked) {
    for (const p of plans) results.push({ ...publicPlan(p), status: p.action === 'blocked' ? 'blocked' : blocked ? 'not_executed' : 'planned' });
  } else {
    let stopped = false;
    for (let i = 0; i < expanded.length; i++) {
      if (stopped) { results.push({ ...publicPlan(plans[i]), status: 'not_executed' }); continue; }
      let p = plans[i], writtenId;
      let writeAttempted = false;
      try {
        // Re-read after prior operations so duplicate input and resumed runs become skips.
        p = await planRecord(expanded[i], ids, req);
        if (p.action === 'skip') { results.push({ ...publicPlan(p), status: 'skipped' }); continue; }
        writeAttempted = true;
        const response = await req(p.action === 'create' ? 'POST' : 'PATCH', p.action === 'create' ? '/pages' : `/pages/${p.id}`, p.body);
        writtenId = response.id;
        if (!writtenId || (p.id && p.id !== writtenId)) throw new Error('Invalid write response; outcome unverified');
        const row = await req('GET', `/pages/${writtenId}`);
        if (row.id !== writtenId) throw new Error('Read-back page mismatch');
        for (const [k, v] of Object.entries(p.body.properties || {})) {
          if (row.properties?.[k]?.has_more || !isDeepStrictEqual(canonical(row.properties?.[k], p.schema.properties[k].type), canonical(v, p.schema.properties[k].type))) throw new Error('Read-back verification failed');
        }
        if (p.body.archived && !row.archived) throw new Error('Archive verification failed');
        results.push({ ...publicPlan(p), id: writtenId, url: row.url, status: 'applied' });
      } catch (e) {
        results.push({ ...publicPlan(p), id: writtenId || p.id, status: 'failed', write_attempted: writeAttempted,
          outcome: writeAttempted ? 'unverified' : 'not_written', error: e.message, ...e.details });
        stopped = true;
      }
    }
  }
  const summary = { planned: 0, created: 0, updated: 0, archived: 0, skipped: 0, blocked: 0, failed: 0, not_executed: 0 };
  for (const r of results) {
    if (r.status === 'applied') summary[{ create: 'created', update: 'updated', archive: 'archived' }[r.action]]++;
    else summary[r.status]++;
  }
  return { mode, ok: !summary.failed && !summary.blocked, summary, results };
}

async function main() {
  const args = parseArgs(process.argv);
  const records = fs.readFileSync(0, 'utf8').split(/\r?\n/).filter(s => s.trim()).map(s => JSON.parse(s));
  const transport = (method, endpoint, body) => notionReq(method, endpoint, body, args['notionctl-path'] ?? process.env.NOTIONCTL_PATH);
  const result = await run(records, idsFromArgs(args), args.apply ? 'apply' : 'plan', transport);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

module.exports = { run, parseArgs, idsFromArgs, notionctlPath, notionReq };
if (require.main === module) main().catch(() => {
  // Parsing may include private input fragments; don't echo those exceptions.
  console.error('Invalid input or configuration. Check JSONL, mode flags and target IDs.');
  process.exitCode = 1;
});
