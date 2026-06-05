#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { queryDataSource, queryRecent, requireIds, textOf } from './notionctl_bridge.js';

const DEFAULT_STATE_DIR = 'memory/soul-in-sapphire';
const DEFAULT_TTL_MINUTES = 120;
const DEFAULT_DAILY_CAP = 10;
const DEFAULT_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const TITLE_LIMIT = 80;
const CONTENT_LIMIT = 800;
const MARKERS = ['unresolved', 'todo', 'tension'];

function nowIso() {
  return new Date().toISOString();
}

function usage() {
  return `Usage:
  node skills/soul-in-sapphire/scripts/stage_ambient_recall.js [options]

Options:
  --workspace <path>       OpenClaw agent workspace. Defaults to OPENCLAW_WORKSPACE or cwd.
  --state-dir <path>       State directory. Relative paths are under workspace.
                           Defaults to SIS_AMBIENT_STATE_DIR or memory/soul-in-sapphire.
  --timezone <iana_tz>     Day boundary for rollsToday/hitsToday.
                           Defaults to SIS_AMBIENT_TIMEZONE or the local runtime timezone.
  --ttl-minutes <n>        Staged recall TTL. Default: 120.
  --daily-cap <n>          Max hit/stage attempts per day. Default: 10.
  --state-dsid <id>        Notion state data source id for recent shelf.
  --journal-dsid <id>      Notion journal data source id for recent shelf.
  --mem-dsid <id>          Notion memory data source id for durable shelf.
  --mem-dbid <id>          Notion memory database id for durable shelf.
  --force-roll <1-100>     Force a deterministic roll for verification.
  --dry-run                Do not write state or staged recall files.
  --help, -h               Show this help and exit without rolling.
`;
}

function todayInTimeZone(timeZone) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map(p => [p.type, p.value]));
    return `${values.year}-${values.month}-${values.day}`;
  } catch (err) {
    throw new Error(`Invalid --timezone value: ${timeZone}`);
  }
}

function expandHome(p) {
  if (!p) return p;
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

function parseNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseArgs(argv) {
  const out = {
    workspace: process.env.OPENCLAW_WORKSPACE || process.cwd(),
    stateDir: process.env.SIS_AMBIENT_STATE_DIR || DEFAULT_STATE_DIR,
    ttlMinutes: DEFAULT_TTL_MINUTES,
    dailyCap: DEFAULT_DAILY_CAP,
    stateDsid: '',
    journalDsid: '',
    memDsid: '',
    memDbid: '',
    forceRoll: null,
    dryRun: false,
    timezone: process.env.SIS_AMBIENT_TIMEZONE || DEFAULT_TIMEZONE,
    help: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--timezone') out.timezone = argv[++i] || out.timezone;
    else if (a === '--workspace') out.workspace = argv[++i] || out.workspace;
    else if (a === '--state-dir') out.stateDir = argv[++i] || out.stateDir;
    else if (a === '--ttl-minutes') out.ttlMinutes = parseNumber(argv[++i], out.ttlMinutes);
    else if (a === '--daily-cap') out.dailyCap = parseNumber(argv[++i], out.dailyCap);
    else if (a === '--state-dsid') out.stateDsid = argv[++i] || '';
    else if (a === '--journal-dsid') out.journalDsid = argv[++i] || '';
    else if (a === '--mem-dsid') out.memDsid = argv[++i] || '';
    else if (a === '--mem-dbid') out.memDbid = argv[++i] || '';
    else if (a === '--force-roll') out.forceRoll = parseNumber(argv[++i], null);
    else if (a === '--dry-run') out.dryRun = true;
  }

  out.workspace = path.resolve(expandHome(out.workspace));
  out.stateDir = expandHome(out.stateDir);
  if (!path.isAbsolute(out.stateDir)) out.stateDir = path.join(out.workspace, out.stateDir);
  out.stateDir = path.resolve(out.stateDir);
  out.ttlMinutes = Math.max(1, Math.floor(out.ttlMinutes));
  out.dailyCap = Math.max(0, Math.floor(out.dailyCap));
  if (out.forceRoll !== null) {
    out.forceRoll = Math.max(1, Math.min(100, Math.floor(out.forceRoll)));
  }
  return out;
}

function defaultState(date, dailyCap) {
  return {
    version: 1,
    date,
    rollsToday: 0,
    hitsToday: 0,
    lastRollAt: null,
    lastHitAt: null,
    dailyCap,
    lastError: null,
  };
}

function readJsonFile(file) {
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

function loadState(file, dailyCap, timeZone) {
  const date = todayInTimeZone(timeZone);
  let state = defaultState(date, dailyCap);
  let loadError = null;
  if (fs.existsSync(file)) {
    try {
      const parsed = readJsonFile(file);
      if (parsed && typeof parsed === 'object' && parsed.version === 1) {
        state = { ...state, ...parsed, dailyCap };
      } else {
        loadError = 'ambient state was invalid; reinitialized';
      }
    } catch {
      loadError = 'ambient state JSON was unreadable; reinitialized';
    }
  }
  if (state.date !== date) {
    state = {
      ...state,
      date,
      rollsToday: 0,
      hitsToday: 0,
      dailyCap,
      lastError: null,
    };
  }
  state._loadError = loadError;
  return state;
}

function atomicWriteJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', 'utf-8');
  fs.renameSync(tmp, file);
}

function randomRoll() {
  return crypto.randomInt(1, 101);
}

function shelfForRoll(roll) {
  if (roll >= 1 && roll <= 3) return 'recent';
  if (roll === 4) return 'unresolved';
  if (roll === 5) return 'durable';
  if (roll === 6) return 'dream';
  return null;
}

function truncateText(value, limit) {
  const s = String(value || '').replace(/\s+/g, ' ').trim();
  if (s.length <= limit) return s;
  return `${s.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

function relativePath(workspace, file) {
  const rel = path.relative(workspace, file);
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel : file;
}

function candidate(title, content, source) {
  const t = truncateText(title, TITLE_LIMIT);
  const c = truncateText(content || title, CONTENT_LIMIT);
  if (!t && !c) return null;
  return { title: t || truncateText(c, TITLE_LIMIT), content: c, source };
}

function markdownText(s) {
  return String(s || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^#+\s*/gm, '')
    .replace(/^\s*[-*]\s*/gm, '')
    .replace(/\[[^\]]+\]\([^)]+\)/g, m => m.replace(/\[|\]\([^)]+\)/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
}

function newestFiles(dir, suffix = '.md', limit = 10) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isFile() && d.name.endsWith(suffix))
    .map(d => path.join(dir, d.name))
    .sort((a, b) => b.localeCompare(a))
    .slice(0, limit);
}

function readFirstExistingJsonl(files) {
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const lines = fs.readFileSync(file, 'utf-8').split(/\r?\n/).filter(Boolean);
    for (const line of lines.reverse()) {
      try {
        const obj = JSON.parse(line);
        return { file, obj };
      } catch {
        // Keep scanning older lines.
      }
    }
  }
  return null;
}

function readDreamRem(workspace) {
  const dir = path.join(workspace, 'memory', 'dreaming', 'rem');
  for (const file of newestFiles(dir, '.md', 14)) {
    const raw = fs.readFileSync(file, 'utf-8');
    const lines = raw.split(/\r?\n/);
    const picked = lines.find(line => /^-\s+(?!No strong)/i.test(line.trim()));
    if (picked) {
      return candidate('REM dream reflection', picked.replace(/^-\s*/, ''), {
        type: 'openclaw_dream',
        path: relativePath(workspace, file),
      });
    }
  }
  return null;
}

function readDreamLight(workspace) {
  const dir = path.join(workspace, 'memory', 'dreaming', 'light');
  for (const file of newestFiles(dir, '.md', 14)) {
    const raw = fs.readFileSync(file, 'utf-8');
    const blocks = raw.split(/\n(?=-\s+Candidate:)/g).filter(s => /^\s*-\s+Candidate:/m.test(s));
    for (const block of blocks) {
      if (!/status:\s*staged/i.test(block)) continue;
      const text = markdownText(block.replace(/^\s*-\s+Candidate:\s*/m, ''));
      if (text) {
        return candidate('Light dream candidate', text, {
          type: 'openclaw_dream',
          path: relativePath(workspace, file),
        });
      }
    }
  }
  return null;
}

function readDreamDiary(workspace) {
  const file = path.join(workspace, 'DREAMS.md');
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, 'utf-8');
  const chunks = raw.split(/\n---+\n/g).map(s => markdownText(s)).filter(s => s && s !== 'Dream Diary');
  const latest = chunks[chunks.length - 1];
  if (!latest) return null;
  return candidate('Dream diary', latest, {
    type: 'openclaw_dream',
    path: relativePath(workspace, file),
  });
}

function readDream(workspace) {
  return readDreamRem(workspace) || readDreamLight(workspace) || readDreamDiary(workspace);
}

function readLatestDailyMemory(workspace) {
  const file = newestFiles(path.join(workspace, 'memory'), '.md', 1)[0];
  if (!file) return null;
  const text = markdownText(fs.readFileSync(file, 'utf-8'));
  if (!text) return null;
  return candidate('Recent daily memory', text, {
    type: 'workspace_memory',
    path: relativePath(workspace, file),
  });
}

function readDailyMarker(workspace) {
  const files = newestFiles(path.join(workspace, 'memory'), '.md', 40);
  for (const file of files) {
    const raw = fs.readFileSync(file, 'utf-8');
    const lines = raw.split(/\r?\n/);
    const line = lines.find(l => MARKERS.some(m => l.toLowerCase().includes(m)));
    if (!line) continue;
    return candidate('Unresolved memory marker', line, {
      type: 'workspace_memory',
      path: relativePath(workspace, file),
    });
  }
  return null;
}

function readUnresolved(workspace) {
  const hit = readFirstExistingJsonl([
    path.join(workspace, 'memory', 'soul-in-sapphire', 'conflicts.jsonl'),
    path.join(workspace, 'memory', 'conflicts.jsonl'),
    path.join(workspace, 'soul-in-sapphire', 'state', 'conflicts.jsonl'),
  ]);
  if (hit) {
    const r = hit.obj;
    const content = [
      r.tension,
      r.current_pull ? `current_pull: ${r.current_pull}` : '',
      r.next_signal ? `next_signal: ${r.next_signal}` : '',
      r.note,
    ].filter(Boolean).join(' ');
    const title = r.tension || 'Unresolved tension';
    return candidate(title, content, {
      type: 'local_conflict',
      path: relativePath(workspace, hit.file),
    });
  }
  return readDailyMarker(workspace);
}

function normalizeStatePage(page) {
  const p = page?.properties || {};
  const title = textOf(p.reason) || textOf(p.Name) || textOf(p.when) || 'Recent state';
  const parts = [
    textOf(p.when),
    textOf(p.mood_label),
    textOf(p.intent),
    textOf(p.need_stack),
    textOf(p.reason),
  ].flat().filter(Boolean).join(' ');
  return candidate(title, parts, {
    type: 'notion_state',
    id: page?.id,
    url: page?.url,
  });
}

function normalizeJournalPage(page) {
  const p = page?.properties || {};
  const title = textOf(p.Name) || textOf(p.when) || 'Recent journal';
  const parts = [
    textOf(p.when),
    textOf(p.body),
    textOf(p.worklog),
    textOf(p.future),
  ].flat().filter(Boolean).join(' ');
  return candidate(title, parts, {
    type: 'notion_journal',
    id: page?.id,
    url: page?.url,
  });
}

function readRecent(args) {
  if (args.stateDsid) {
    const pages = queryRecent(args.stateDsid, 1);
    if (pages[0]) return normalizeStatePage(pages[0]);
  }
  if (args.journalDsid) {
    const pages = queryRecent(args.journalDsid, 1);
    if (pages[0]) return normalizeJournalPage(pages[0]);
  }
  return readLatestDailyMemory(args.workspace);
}

async function readDurable(args) {
  const cfg = { data_source_id: args.memDsid, database_id: args.memDbid };
  requireIds(cfg);
  const res = await queryDataSource(args.memDsid, {
    page_size: 25,
    sorts: [{ timestamp: 'created_time', direction: 'descending' }],
  });
  const pages = res?.results || [];
  if (!pages.length) return null;
  const page = pages[crypto.randomInt(0, pages.length)];
  const p = page?.properties || {};
  return candidate(textOf(p.Name) || 'Durable memory', textOf(p.Content), {
    type: 'notion_memory',
    id: page?.id,
    url: page?.url,
  });
}

async function readShelf(shelf, args) {
  if (shelf === 'recent') return readRecent(args);
  if (shelf === 'unresolved') return readUnresolved(args.workspace);
  if (shelf === 'durable') return await readDurable(args);
  if (shelf === 'dream') return readDream(args.workspace);
  return null;
}

function buildStaged(candidateObj, shelf, roll, args, at) {
  const expires = new Date(new Date(at).getTime() + args.ttlMinutes * 60 * 1000).toISOString();
  return {
    version: 1,
    kind: 'ambient_recall',
    shelf,
    staged_at: at,
    expires_at: expires,
    roll,
    title: truncateText(candidateObj.title, TITLE_LIMIT),
    content: truncateText(candidateObj.content, CONTENT_LIMIT),
    source: candidateObj.source || { type: shelf },
  };
}

function cleanExpired(stagedFile) {
  if (!fs.existsSync(stagedFile)) return false;
  try {
    const obj = readJsonFile(stagedFile);
    if (obj?.expires_at && new Date(obj.expires_at).getTime() < Date.now()) {
      fs.unlinkSync(stagedFile);
      return true;
    }
  } catch {
    fs.unlinkSync(stagedFile);
    return true;
  }
  return false;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    process.stdout.write(usage());
    return;
  }
  const stateFile = path.join(args.stateDir, 'ambient-recall-state.json');
  const stagedFile = path.join(args.stateDir, 'ambient-recall.json');
  const at = nowIso();
  let state = loadState(stateFile, args.dailyCap, args.timezone);
  const loadError = state._loadError;
  delete state._loadError;
  const roll = args.forceRoll ?? randomRoll();
  const shelf = shelfForRoll(roll);
  let staged = null;
  let cleanedExpired = false;

  state.rollsToday = Number(state.rollsToday || 0) + 1;
  state.lastRollAt = at;
  state.dailyCap = args.dailyCap;
  state.lastError = loadError || null;

  try {
    if (state.hitsToday >= args.dailyCap && shelf) {
      state.lastError = `dailyCap reached (${args.dailyCap}); skipped ${shelf}`;
    } else if (shelf) {
      const c = await readShelf(shelf, args);
      if (c) {
        staged = buildStaged(c, shelf, roll, args, at);
        state.hitsToday = Number(state.hitsToday || 0) + 1;
        state.lastHitAt = at;
      } else {
        state.lastError = `no ambient candidate for shelf: ${shelf}`;
      }
    } else if (!args.dryRun) {
      cleanedExpired = cleanExpired(stagedFile);
    }
  } catch (err) {
    state.lastError = truncateText(err?.message || String(err), 240);
  }

  if (!args.dryRun) {
    fs.mkdirSync(args.stateDir, { recursive: true });
    atomicWriteJson(stateFile, state);
    if (staged) atomicWriteJson(stagedFile, staged);
  }

  console.log(JSON.stringify({
    ok: true,
    dryRun: args.dryRun,
    roll,
    shelf,
    staged: !!staged,
    cleanedExpired,
    stateFile,
    stagedFile,
    timezone: args.timezone,
    lastError: state.lastError,
    recall: staged,
  }, null, 2));
}

try {
  await main();
} catch (err) {
  console.error(String(err?.stack || err));
  process.exit(1);
}
