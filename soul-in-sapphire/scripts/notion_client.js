#!/usr/bin/env node
import fs from 'fs';
import os from 'os';
import path from 'path';

const NOTION_API_BASE = 'https://api.notion.com';
const NOTION_VERSION = '2025-09-03';

function getToken() {
  const t = process.env.NOTION_API_KEY || process.env.NOTION_TOKEN || process.env.NOTION_API_TOKEN;
  if (t && String(t).trim()) return String(t).trim();
  const p = path.join(os.homedir(), '.config', 'notion', 'api_key');
  if (fs.existsSync(p)) {
    const v = fs.readFileSync(p, 'utf-8').trim();
    if (v) return v;
  }
  throw new Error('Missing NOTION_API_KEY (or NOTION_TOKEN/NOTION_API_TOKEN)');
}

async function notionReq(method, apiPath, body = null) {
  const token = getToken();
  const res = await fetch(`${NOTION_API_BASE}${apiPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body == null ? undefined : JSON.stringify(body),
  });
  const txt = await res.text();
  const json = txt ? JSON.parse(txt) : {};
  if (!res.ok) {
    throw new Error(`Notion HTTP ${res.status} ${apiPath}: ${txt}`);
  }
  return json;
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
    const res = await notionReq('GET', `/v1/blocks/${parentPageId}/children${q}`);
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
  // Notion 2025-09-03: create database endpoint remains /v1/databases for top-level DB object
  return notionReq('POST', '/v1/databases', {
    parent: { page_id: parentPageId },
    title: [{ type: 'text', text: { content: String(title) } }],
    properties,
  });
}

async function getDatabase(databaseId) {
  return notionReq('GET', `/v1/databases/${databaseId}`);
}

async function patchDataSource(dataSourceId, propertiesPatch) {
  return notionReq('PATCH', `/v1/data_sources/${dataSourceId}`, {
    properties: propertiesPatch,
  });
}

function relationSingleProperty(ref) {
  return {
    relation: {
      data_source_id: ref.dataSourceId,
      single_property: {},
    },
  };
}

async function createPage(databaseId, properties) {
  return notionReq('POST', '/v1/pages', {
    parent: { database_id: databaseId },
    properties,
  });
}

async function queryDataSource(dataSourceId, body = {}) {
  return notionReq('POST', `/v1/data_sources/${dataSourceId}/query`, body || {});
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
};
