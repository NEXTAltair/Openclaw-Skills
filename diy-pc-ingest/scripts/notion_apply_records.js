#!/usr/bin/env node
/**
 * Apply JSONL records to DIY_PC Notion tables (JS version).
 *
 * Deterministic upsert:
 * - reads JSONL from stdin
 * - upserts by configured keys
 * - patches only missing fields unless overwrite=true
 *
 * All Notion IDs are passed as CLI arguments (see TOOLS.md for values):
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
const NOTIONCTL_PATH = path.resolve(__dirname, '..', '..', 'notion-api-automation', 'scripts', 'notionctl.mjs');

function die(msg) {
  process.stderr.write(String(msg) + '\n');
  process.exit(1);
}

// Target schema: title_prop and key arrays are schema-derived constants.
const TARGET_SCHEMA = {
  pcconfig:  { title_prop: 'Name', key: ['Name', 'Purchase Date'] },
  pcinput:   { title_prop: '名前', key: ['型番', 'Serial', '名前'] },
  storage:   { title_prop: 'Name', key: ['シリアル'] },
  enclosure: { title_prop: 'Name', key: ['取り外し表示名', 'Name'] },
};

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      out[k] = argv[++i] || '';
    }
  }
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

function safeEnv(extra = {}) {
  const env = {
    PATH: process.env.PATH || '',
    HOME: process.env.HOME || '',
    LANG: process.env.LANG || 'C.UTF-8',
    LC_ALL: process.env.LC_ALL || '',
    LC_CTYPE: process.env.LC_CTYPE || '',
    SYSTEMROOT: process.env.SYSTEMROOT || '',
    WINDIR: process.env.WINDIR || '',
  };
  for (const k of ['NOTION_API_KEY', 'NOTION_TOKEN', 'NOTION_API_KEY_FILE']) {
    if (process.env[k]) env[k] = process.env[k];
  }
  return { ...env, ...extra };
}

async function notionReq(method, apiPath, body) {
  const p = String(apiPath).startsWith('/v1/') ? String(apiPath) : `/v1${String(apiPath).startsWith('/') ? '' : '/'}${String(apiPath)}`;
  const args = [
    NOTIONCTL_PATH,
    'api',
    '--compact',
    '--method', String(method).toUpperCase(),
    '--path', p,
  ];
  if (body !== undefined && body !== null) args.push('--body-json', JSON.stringify(body));

  const env = safeEnv({ NOTION_VERSION: notionVersion() });

  const out = execFileSync('node', args, { encoding: 'utf-8', env }).trim();
  const obj = out ? JSON.parse(out) : {};
  if (!obj.ok) throw new Error(`notionctl api not ok: ${out}`);
  return obj.result || {};
}

function normalize(s) {
  return String(s ?? '').trim().replace(/\s+/g, ' ');
}

function propPlainText(prop) {
  if (!prop) return '';
  const t = prop.type;
  if (t === 'title' || t === 'rich_text') {
    const arr = prop[t] || [];
    return arr.map(x => x?.plain_text || '').join('').trim();
  }
  return '';
}

function propDateStart(prop) {
  if (!prop || prop.type !== 'date') return null;
  return prop.date?.start ?? null;
}

function propNumber(prop) {
  if (!prop || prop.type !== 'number') return null;
  return prop.number;
}

function getValueFromRow(row, propName) {
  const props = row?.properties || {};
  const p = props[propName];
  if (!p) return null;
  const t = p.type;
  if (t === 'title' || t === 'rich_text') return propPlainText(p);
  if (t === 'date') return propDateStart(p);
  if (t === 'number') return propNumber(p);
  if (t === 'select') return p.select?.name ?? null;
  if (t === 'status') return p.status?.name ?? null;
  if (t === 'url') return p.url ?? null;
  return null;
}

async function queryByTitle(dataSourceId, titleProp, contains, pageSize = 10) {
  const body = { page_size: pageSize, filter: { property: titleProp, title: { contains } } };
  const j = await notionReq('POST', `/data_sources/${dataSourceId}/query`, body);
  return j.results || [];
}

async function queryByRichText(dataSourceId, prop, contains, pageSize = 10) {
  const body = { page_size: pageSize, filter: { property: prop, rich_text: { contains } } };
  const j = await notionReq('POST', `/data_sources/${dataSourceId}/query`, body);
  return j.results || [];
}

function buildProp(schemaProp, value) {
  const t = schemaProp?.type;
  if (!t) return null;

  if (t === 'title') {
    return { title: [{ type: 'text', text: { content: String(value) } }] };
  }
  if (t === 'rich_text') {
    return { rich_text: [{ type: 'text', text: { content: String(value) } }] };
  }
  if (t === 'number') {
    if (value === null || value === undefined || value === '') return { number: null };
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
    return arr.some(x => (x?.plain_text || '').trim());
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
    if (!(k in schProps)) continue;
    const schemaProp = schProps[k];

    if (!overwrite) {
      const ep = existingProps?.[k];
      if (patchSkipsExisting(ep)) continue;
    }

    const built = buildProp(schemaProp, v);
    if (built !== null) out[k] = built;
  }

  return out;
}

async function findExisting(ids, target, schema, propsIn) {
  const tcfg = ids[target];
  const ds = tcfg.data_source_id;
  const schProps = schema?.properties || {};
  const keyProps = Array.from(tcfg.key || []);

  // composite key
  if (keyProps.length >= 2 && keyProps.every(k => propsIn?.[k])) {
    const first = keyProps[0];
    const firstSchema = schProps[first] || {};
    const firstType = firstSchema.type;
    const firstVal = normalize(propsIn[first]);

    let hits = [];
    if (firstType === 'title') hits = await queryByTitle(ds, first, firstVal, 25);
    else if (firstType === 'rich_text') hits = await queryByRichText(ds, first, firstVal, 25);

    const narrowed = hits.filter(row => {
      for (const k of keyProps) {
        const wantRaw = propsIn[k];
        if (wantRaw === null || wantRaw === undefined || wantRaw === '') return false;
        const got = getValueFromRow(row, k);
        const want = typeof wantRaw === 'string' ? normalize(wantRaw) : String(wantRaw);
        const gotN = typeof got === 'string' ? normalize(got) : (got === null || got === undefined ? null : String(got));
        if (gotN !== want) return false;
      }
      return true;
    });

    if (narrowed.length === 1) return narrowed[0];
    return null;
  }

  // single-key legacy
  for (const keyProp of keyProps) {
    const v0 = propsIn?.[keyProp];
    if (!v0) continue;
    const v = normalize(v0);
    if (!v) continue;
    const schemaProp = schProps[keyProp];
    if (!schemaProp) continue;

    let hits = [];
    if (schemaProp.type === 'rich_text') hits = await queryByRichText(ds, keyProp, v, 10);
    else if (schemaProp.type === 'title') hits = await queryByTitle(ds, keyProp, v, 10);

    if (hits.length === 1) return hits[0];
  }

  // storage safe fallback: title + (optional) purchase date/price
  if (target === 'storage') {
    const title = propsIn?.Name || propsIn?.名前;
    if (!title) return null;
    const titleN = normalize(title);
    const hits = await queryByTitle(ds, tcfg.title_prop, titleN, 10);
    if (!hits || hits.length === 0) return null;

    const wantDate = propsIn?.['購入日'];
    const wantPrice = propsIn?.['価格(円)'];

    function ok(row) {
      const props = row?.properties || {};
      if (wantDate) {
        const got = propDateStart(props['購入日']);
        if (String(got) !== String(wantDate)) return false;
      }
      if (wantPrice !== null && wantPrice !== undefined) {
        const got = propNumber(props['価格(円)']);
        if (got === null || got === undefined) return false;
        if (Number(got) !== Number(wantPrice)) return false;
      }
      return true;
    }

    const narrowed = hits.filter(ok);
    if (narrowed.length === 1) return narrowed[0];

    if (hits.length === 1) {
      const serial = propPlainText((hits[0].properties || {})['シリアル']);
      if (!serial) return hits[0];
    }
  }

  return null;
}

async function createPage(ids, target, schema, title, properties) {
  const tcfg = ids[target];
  const titleProp = tcfg.title_prop;
  const schProps = schema?.properties || {};

  const outProps = {};
  if (title) {
    if (schProps[titleProp]) outProps[titleProp] = buildProp(schProps[titleProp], title);
    else if (schProps['Name']) outProps['Name'] = buildProp(schProps['Name'], title);
  }

  for (const [k, v] of Object.entries(properties || {})) {
    if (k === titleProp) continue;
    if (!(k in schProps)) continue;
    const built = buildProp(schProps[k], v);
    if (built !== null) outProps[k] = built;
  }

  const body = { parent: { database_id: tcfg.database_id }, properties: outProps };
  return await notionReq('POST', '/pages', body);
}

function requireIds(ids, target) {
  const t = ids[target] || {};
  const missing = [];
  if (!t.data_source_id) missing.push(`--${target}-dsid`);
  if (!t.database_id) missing.push(`--${target}-dbid`);
  if (missing.length) {
    die(`Missing Notion IDs: ${missing.join(', ')}. Check TOOLS.md for the values.`);
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const ids = idsFromArgs(args);

  const raw = fs.readFileSync(0, 'utf-8');
  const lines = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (!lines.length) {
    console.log('NO_RECORDS');
    return;
  }

  const records = lines.map(l => JSON.parse(l));
  const cacheSchema = {};

  const summary = { created: 0, updated: 0, skipped: 0, errors: 0 };
  const results = [];

  for (const rec of records) {
    const target = rec.target;
    if (!ids[target]) {
      summary.errors += 1;
      results.push({ error: `unknown target: ${target}`, record: rec });
      continue;
    }

    requireIds(ids, target);

    const overwrite = Boolean(rec.overwrite);
    const pageId = rec.page_id || rec.id;
    const archive = Boolean(rec.archive || rec.archived);

    if (!cacheSchema[target]) {
      cacheSchema[target] = await notionReq('GET', `/data_sources/${ids[target].data_source_id}`);
    }
    const schema = cacheSchema[target];

    const title = rec.title || rec.properties?.Name || rec.properties?.名前;
    const propsIn = rec.properties || {};

    // direct page update
    if (pageId) {
      const existingPage = await notionReq('GET', `/pages/${pageId}`);
      const patch = buildPatch(schema, propsIn, existingPage.properties || {}, overwrite);
      const body = {};
      if (Object.keys(patch).length) body.properties = patch;
      if (archive) body.archived = true;

      if (Object.keys(body).length) {
        const updated = await notionReq('PATCH', `/pages/${pageId}`, body);
        summary.updated += 1;
        results.push({ action: 'updated', target, id: updated.id, url: updated.url });
      } else {
        summary.skipped += 1;
        results.push({ action: 'skipped', target, id: existingPage.id, url: existingPage.url });
      }
      continue;
    }

    const existing = await findExisting(ids, target, schema, propsIn);
    if (existing) {
      const patch = buildPatch(schema, propsIn, existing.properties || {}, overwrite);
      if (Object.keys(patch).length) {
        const updated = await notionReq('PATCH', `/pages/${existing.id}`, { properties: patch });
        summary.updated += 1;
        results.push({ action: 'updated', target, id: updated.id, url: updated.url });
      } else {
        summary.skipped += 1;
        results.push({ action: 'skipped', target, id: existing.id, url: existing.url });
      }
    } else {
      const created = await createPage(ids, target, schema, String(title || '(untitled)'), propsIn);
      summary.created += 1;
      results.push({ action: 'created', target, id: created.id, url: created.url });
    }

    // mirror storage -> pcconfig
    if (target === 'storage' && rec.mirror_to_pcconfig) {
      const pc = propsIn['現在の接続先PC'];
      const purchaseDate = propsIn['購入日'];
      const name = propsIn['Name'];
      if (!(pc && purchaseDate && name)) {
        summary.skipped += 1;
        results.push({ action: 'skipped', target: 'pcconfig', reason: 'mirror_missing_fields' });
      } else {
        requireIds(ids, 'pcconfig');
        if (!cacheSchema.pcconfig) {
          cacheSchema.pcconfig = await notionReq('GET', `/data_sources/${ids.pcconfig.data_source_id}`);
        }
        const pcSchema = cacheSchema.pcconfig;
        const pcProps = {
          PC: pc,
          Category: 'ストレージ',
          Name: String(name),
          'Purchase Date': String(purchaseDate),
          'Purchase Vendor': propsIn['購入店'],
          'Purchase Price': propsIn['価格(円)'],
          Spec: `S/N: ${propsIn['シリアル'] || ''}`,
          Installed: true,
          Active: true,
          Notes: 'mirrored from storage',
        };
        const pcExisting = await findExisting(ids, 'pcconfig', pcSchema, pcProps);
        if (pcExisting) {
          const pcPatch = buildPatch(pcSchema, pcProps, pcExisting.properties || {}, false);
          if (Object.keys(pcPatch).length) {
            const pcUpdated = await notionReq('PATCH', `/pages/${pcExisting.id}`, { properties: pcPatch });
            summary.updated += 1;
            results.push({ action: 'updated', target: 'pcconfig', id: pcUpdated.id, url: pcUpdated.url, reason: 'mirrored' });
          } else {
            summary.skipped += 1;
            results.push({ action: 'skipped', target: 'pcconfig', id: pcExisting.id, url: pcExisting.url, reason: 'mirrored_no_changes' });
          }
        } else {
          const pcCreated = await createPage(ids, 'pcconfig', pcSchema, String(name), pcProps);
          summary.created += 1;
          results.push({ action: 'created', target: 'pcconfig', id: pcCreated.id, url: pcCreated.url, reason: 'mirrored' });
        }
      }
    }
  }

  console.log(JSON.stringify({ summary, results }, null, 2));
}

main().catch(err => {
  process.stderr.write(String(err?.message || err) + '\n');
  process.exit(1);
});
