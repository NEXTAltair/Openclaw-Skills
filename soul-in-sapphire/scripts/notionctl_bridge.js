#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NOTION_AUTH_ENV_KEYS = ['NOTION_API_KEY', 'NOTION_TOKEN', 'NOTION_API_TOKEN'];

function expandHome(p) {
  if (!p) return p;
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

function notionctlPath() {
  const explicit = process.env.NOTIONCTL_PATH ? expandHome(process.env.NOTIONCTL_PATH) : null;
  if (explicit) {
    if (!fs.existsSync(explicit)) throw new Error(`NOTIONCTL_PATH not found: ${explicit}`);
    return explicit;
  }
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, '..', '..', 'notion-api-automation', 'scripts', 'notionctl.mjs'),
    // Owner-qualified installs live under skills/@owner/<slug>/scripts.
    path.resolve(here, '..', '..', '..', 'notion-api-automation', 'scripts', 'notionctl.mjs'),
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error(`notionctl not found (set NOTIONCTL_PATH to override): ${candidates[0]}`);
  return found;
}

function parseNotionctlJson(raw) {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function apiCompatibilityHint(rawText) {
  const text = String(rawText || '');
  if (!text.includes('Unknown command: api')) return null;
  return 'Installed notionctl does not support "api". Update skills/notion-api-automation/scripts/notionctl.mjs or set NOTIONCTL_PATH to a compatible notionctl.';
}

function authSetupHint() {
  return [
    'Configure Notion auth with NOTION_API_KEY/NOTION_TOKEN,',
    'or set skills.entries["soul-in-sapphire"].apiKey to an OpenClaw SecretRef.',
    'The SecretRef provider can be env, file, exec, or another OpenClaw-supported secure provider.',
  ].join(' ');
}

function redactKnownSecrets(text) {
  let out = String(text || '');
  for (const k of NOTION_AUTH_ENV_KEYS) {
    const value = process.env[k];
    if (!value) continue;
    out = out.split(String(value)).join(`[redacted:${k}]`);
  }
  return out;
}

function extractExecFailure(err) {
  const stdout = err?.stdout ? String(err.stdout).trim() : '';
  const stderr = err?.stderr ? String(err.stderr).trim() : '';
  const msg = err?.message ? String(err.message) : String(err);
  return { stdout, stderr, msg };
}

function normalizeApiPath(apiPath) {
  const p = String(apiPath || '').trim();
  if (!p) throw new Error('Missing apiPath');
  if (p.startsWith('/v1/') || p === '/v1') return p;
  if (p.startsWith('/')) return `/v1${p}`;
  return `/v1/${p}`;
}

function runApi(method, apiPath, body = null) {
  const args = [notionctlPath(), 'api', '--compact', '--method', String(method).toUpperCase(), '--path', String(apiPath)];
  if (body != null) args.push('--body-json', JSON.stringify(body));
  let out = '';
  try {
    out = execFileSync('node', args, { encoding: 'utf-8' }).trim();
  } catch (err) {
    const info = extractExecFailure(err);
    const combined = [info.stdout, info.stderr, info.msg].filter(Boolean).join('\n');
    const compat = apiCompatibilityHint(combined);
    if (compat) throw new Error(compat);
    throw new Error(`notionctl api execution failed. ${authSetupHint()}\n${redactKnownSecrets(combined || 'unknown error')}`);
  }

  const obj = parseNotionctlJson(out);
  if (!obj || typeof obj !== 'object') {
    throw new Error(`notionctl returned non-JSON output: ${out}`);
  }
  if (!obj.ok) {
    const compat = apiCompatibilityHint(out);
    if (compat) throw new Error(compat);
    throw new Error(`notionctl api not ok. ${authSetupHint()}\n${redactKnownSecrets(out)}`);
  }
  return obj.result || {};
}

function extractPageId(idOrUrl) {
  if (!idOrUrl) return null;
  const s = String(idOrUrl).trim();
  const dashed = s.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
  if (dashed) return dashed[0].toLowerCase();
  const hex32 = s.match(/[0-9a-fA-F]{32}/);
  if (!hex32) return null;
  const h = hex32[0].toLowerCase();
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}

async function listChildDatabases(parentPageId) {
  const out = new Map();
  let cursor = undefined;
  while (true) {
    const q = cursor ? `?start_cursor=${encodeURIComponent(cursor)}&page_size=100` : '?page_size=100';
    const res = runApi('GET', `/v1/blocks/${parentPageId}/children${q}`);
    for (const b of (res.results || [])) {
      if (b?.type === 'child_database') {
        const title = b?.child_database?.title;
        if (title) out.set(title, b.id);
      }
    }
    if (!res?.has_more || !res?.next_cursor) break;
    cursor = res.next_cursor;
  }
  return out;
}

async function createDatabase(parentPageId, title, properties) {
  return runApi('POST', '/v1/databases', {
    parent: { page_id: parentPageId },
    title: [{ type: 'text', text: { content: String(title) } }],
    properties,
  });
}

async function getDatabase(databaseId) {
  return runApi('GET', `/v1/databases/${databaseId}`);
}

async function patchDataSource(dataSourceId, propertiesPatch) {
  return runApi('PATCH', `/v1/data_sources/${dataSourceId}`, { properties: propertiesPatch });
}

function relationSingleProperty(ref) {
  return { relation: { data_source_id: ref.dataSourceId, single_property: {} } };
}

async function createPage(databaseId, properties) {
  return runApi('POST', '/v1/pages', { parent: { database_id: databaseId }, properties });
}

async function queryDataSource(dataSourceId, body = {}) {
  return runApi('POST', `/v1/data_sources/${dataSourceId}/query`, body || {});
}

function httpJson(method, apiPath, payload = undefined) {
  return runApi(method, normalizeApiPath(apiPath), payload === undefined ? null : payload);
}

function requireIds(cfg) {
  for (const k of ['data_source_id', 'database_id']) {
    if (!cfg?.[k]) throw new Error(`Missing ${k}. Check the workspace AGENTS.md ## Tools section for the value.`);
  }
}

function textOf(prop) {
  if (!prop) return '';
  const t = prop.type;
  if (t === 'title' || t === 'rich_text') return (prop[t] || []).map(x => x?.plain_text || '').join('').trim();
  if (t === 'select') return prop.select?.name || '';
  if (t === 'multi_select') return (prop.multi_select || []).map(x => x?.name).filter(Boolean);
  if (t === 'number') return prop.number;
  if (t === 'date') return prop.date?.start || '';
  if (t === 'url') return prop.url || '';
  if (t === 'relation') return (prop.relation || []).map(x => x?.id).filter(Boolean);
  return '';
}

function queryRecent(dsId, pageSize = 10) {
  const body = { page_size: pageSize, sorts: [{ timestamp: 'created_time', direction: 'descending' }] };
  const res = runApi('POST', `/v1/data_sources/${dsId}/query`, body);
  return res?.results || [];
}

function patchPage(pageId, properties = undefined, archived = undefined) {
  const b = {};
  if (properties !== undefined) b.properties = properties;
  if (archived !== undefined) b.archived = !!archived;
  return runApi('PATCH', `/v1/pages/${pageId}`, b);
}

export {
  extractPageId,
  listChildDatabases,
  createDatabase,
  getDatabase,
  patchDataSource,
  relationSingleProperty,
  createPage,
  queryDataSource,
  httpJson,
  requireIds,
  textOf,
  queryRecent,
  patchPage,
};
