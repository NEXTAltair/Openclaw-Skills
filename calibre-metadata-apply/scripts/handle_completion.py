#!/usr/bin/env python3
import argparse
import json
import subprocess
from pathlib import Path

BASE = Path(__file__).resolve().parent
RUN_STATE = BASE / 'run_state.py'


def run_py(args):
    p = subprocess.run(['python3', str(RUN_STATE)] + args, capture_output=True, text=True)
    if p.returncode != 0:
        raise RuntimeError(p.stderr.strip() or p.stdout.strip())
    return json.loads(p.stdout.strip() or '{}')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--run-id', required=True)
    ap.add_argument('--result-json', required=True, help='Path to subagent JSON result')
    args = ap.parse_args()

    rec = run_py(['get', '--run-id', args.run_id])
    if rec.get('error') == 'not_found':
        print(json.dumps({'error': 'run_not_found', 'run_id': args.run_id}, ensure_ascii=False))
        return

    result_path = Path(args.result_json)
    result = json.loads(result_path.read_text(encoding='utf-8'))

    run_py(['upsert', '--run-id', args.run_id, '--session-key', rec['session_key'], '--task', rec['task'], '--status', 'completed'])
    run_py(['remove', '--run-id', args.run_id])

    out = {
        'run_id': args.run_id,
        'status': 'completed',
        'task': rec.get('task'),
        'result': result,
    }
    print(json.dumps(out, ensure_ascii=False))


if __name__ == '__main__':
    main()
