#!/usr/bin/env node
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

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
  const p = path.resolve(here, '..', '..', 'notion-api-automation', 'scripts', 'notionctl.mjs');
  if (!fs.existsSync(p)) throw new Error(`notionctl not found (set NOTIONCTL_PATH to override): ${p}`);
  return p;
}

function httpJson(method, apiPath, payload = undefined) {
  const args = [notionctlPath(), 'api', '--compact', '--method', String(method).toUpperCase(), '--path', String(apiPath)];
  if (payload !== undefined) args.push('--body-json', JSON.stringify(payload));
  const out = execFileSync('node', args, { encoding: 'utf-8' }).trim();
  const obj = out ? JSON.parse(out) : {};
  if (!obj.ok) throw new Error(`notionctl api not ok: ${out}`);
  return obj.result || {};
}

function loadConfig(p = '~/.config/soul-in-sapphire/config.json') {
  const fp = expandHome(p);
  if (!fs.existsSync(fp)) {
    throw new Error(`Missing config: ${fp}`);
  }
  const cfg = JSON.parse(fs.readFileSync(fp, 'utf-8'));
  if ((!cfg.database_id || !cfg.data_source_id) && cfg.mem?.database_id && cfg.mem?.data_source_id) {
    cfg.database_id = cfg.mem.database_id;
    cfg.data_source_id = cfg.mem.data_source_id;
  }
  return cfg;
}

function requireIds(cfg) {
  for (const k of ['data_source_id', 'database_id']) {
    if (!cfg?.[k]) throw new Error(`Config missing ${k}`);
  }
}

export { httpJson, loadConfig, requireIds, expandHome };
