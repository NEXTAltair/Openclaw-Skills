#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      out[k] = v;
    } else {
      out._.push(a);
    }
  }
  return out;
}

function commonArgs(args) {
  const r = ['--with-library', String(args['with-library'] || '')];
  if (args.username) r.push('--username', String(args.username));
  const penv = String(args['password-env'] || 'CALIBRE_PASSWORD');
  const pw = process.env[penv] || '';
  if (pw) r.push('--password', pw);
  return r;
}

function run(cmd) {
  const cp = spawnSync(cmd[0], cmd.slice(1), { encoding: 'utf8' });
  if (cp.status !== 0) {
    throw new Error(`calibredb failed (${cp.status})\nCMD: ${cmd.map(x => JSON.stringify(x)).join(' ')}\nERR:\n${(cp.stderr || '').trim()}`);
  }
  return cp.stdout || '';
}

function toJson(text) {
  return JSON.parse(text);
}

function requireArg(args, key, hint = '') {
  if (!args[key]) {
    throw new Error(`missing --${key}${hint ? ` (${hint})` : ''}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];

  if (!cmd || !['list', 'search', 'id'].includes(cmd)) {
    console.log(JSON.stringify({
      ok: false,
      error: 'usage: calibredb_read.mjs <list|search|id> --with-library <url#lib> [--username u] [--password-env ENV] [--fields f] [--limit n] [--query q] [--book-id id]'
    }, null, 2));
    process.exit(1);
  }

  try {
    requireArg(args, 'with-library', 'http://HOST:PORT/#LIBRARY_ID');
    const fieldsDefault = 'id,title,authors,series,series_index,tags,formats,publisher,pubdate,languages,last_modified';
    const fields = String(args.fields || (cmd === 'id'
      ? `${fieldsDefault},comments`
      : fieldsDefault));
    const limit = Number(args.limit || 100);

    if (cmd === 'list') {
      const out = run([
        'calibredb', 'list', '--for-machine', '--fields', fields, '--limit', String(limit),
        ...commonArgs(args),
      ]);
      console.log(JSON.stringify({ ok: true, mode: 'list', fields, items: toJson(out) }, null, 2));
      return;
    }

    if (cmd === 'search') {
      requireArg(args, 'query');
      const query = String(args.query);
      const out = run([
        'calibredb', 'list', '--for-machine', '--fields', fields,
        '--search', query, '--limit', String(limit),
        ...commonArgs(args),
      ]);
      console.log(JSON.stringify({ ok: true, mode: 'search', query, fields, items: toJson(out) }, null, 2));
      return;
    }

    // id
    requireArg(args, 'book-id');
    const bookId = String(args['book-id']);
    const out = run([
      'calibredb', 'list', '--for-machine', '--fields', fields,
      '--search', `id:${bookId}`, '--limit', '5',
      ...commonArgs(args),
    ]);
    const rows = toJson(out);
    const item = rows.find(r => String(r?.id) === bookId) || null;
    console.log(JSON.stringify({ ok: true, mode: 'id', book_id: bookId, item }, null, 2));
  } catch (e) {
    console.log(JSON.stringify({ ok: false, error: String(e?.message || e) }, null, 2));
    process.exit(1);
  }
}

main();
