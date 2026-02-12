#!/usr/bin/env python3
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

STATE_PATH = Path(__file__).resolve().parent.parent / 'state' / 'runs.json'


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def load_state():
    if not STATE_PATH.exists():
        return {"runs": {}}
    try:
        return json.loads(STATE_PATH.read_text(encoding='utf-8'))
    except Exception:
        return {"runs": {}}


def save_state(state):
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding='utf-8')


def cmd_upsert(args):
    state = load_state()
    runs = state.setdefault('runs', {})
    rec = runs.get(args.run_id, {})
    rec.update({
        'run_id': args.run_id,
        'session_key': args.session_key,
        'status': args.status,
        'task': args.task,
        'created_at': rec.get('created_at', now_iso()),
        'updated_at': now_iso(),
    })
    if args.meta_json:
        rec['meta'] = json.loads(args.meta_json)
    runs[args.run_id] = rec
    save_state(state)
    print(json.dumps(rec, ensure_ascii=False))


def cmd_get(args):
    state = load_state()
    rec = state.get('runs', {}).get(args.run_id)
    if not rec:
        print(json.dumps({'error': 'not_found', 'run_id': args.run_id}, ensure_ascii=False))
        return
    print(json.dumps(rec, ensure_ascii=False))


def cmd_remove(args):
    state = load_state()
    runs = state.get('runs', {})
    rec = runs.pop(args.run_id, None)
    save_state(state)
    print(json.dumps({'removed': bool(rec), 'run_id': args.run_id}, ensure_ascii=False))


def cmd_list(args):
    state = load_state()
    runs = list(state.get('runs', {}).values())
    runs.sort(key=lambda x: x.get('updated_at', ''), reverse=True)
    if args.status:
        runs = [r for r in runs if r.get('status') == args.status]
    if args.limit:
        runs = runs[:args.limit]
    print(json.dumps({'count': len(runs), 'runs': runs}, ensure_ascii=False))


def cmd_fail(args):
    state = load_state()
    runs = state.setdefault('runs', {})
    rec = runs.get(args.run_id)
    if not rec:
        print(json.dumps({'error': 'not_found', 'run_id': args.run_id}, ensure_ascii=False))
        return
    rec['status'] = 'failed'
    rec['error'] = args.error
    rec['updated_at'] = now_iso()
    runs[args.run_id] = rec
    save_state(state)
    print(json.dumps(rec, ensure_ascii=False))


def main():
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest='cmd', required=True)

    up = sub.add_parser('upsert')
    up.add_argument('--run-id', required=True)
    up.add_argument('--session-key', required=True)
    up.add_argument('--status', default='running')
    up.add_argument('--task', required=True)
    up.add_argument('--meta-json')
    up.set_defaults(func=cmd_upsert)

    g = sub.add_parser('get')
    g.add_argument('--run-id', required=True)
    g.set_defaults(func=cmd_get)

    rm = sub.add_parser('remove')
    rm.add_argument('--run-id', required=True)
    rm.set_defaults(func=cmd_remove)

    ls = sub.add_parser('list')
    ls.add_argument('--status')
    ls.add_argument('--limit', type=int, default=20)
    ls.set_defaults(func=cmd_list)

    fl = sub.add_parser('fail')
    fl.add_argument('--run-id', required=True)
    fl.add_argument('--error', required=True)
    fl.set_defaults(func=cmd_fail)

    args = p.parse_args()
    args.func(args)


if __name__ == '__main__':
    main()
