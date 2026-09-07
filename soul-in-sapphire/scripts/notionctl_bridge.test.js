import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('dependency discovery works for unscoped and owner-qualified installed snapshots', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sis-install-path-'));
  const source = path.join(path.dirname(fileURLToPath(import.meta.url)), 'notionctl_bridge.js');
  const env = { ...process.env };
  for (const name of ['NOTIONCTL_PATH','NOTION_API_KEY','NOTION_TOKEN','NOTION_API_TOKEN']) delete env[name];
  for (const relative of ['skills/soul-in-sapphire', 'skills/@fixture/soul-in-sapphire']) {
    const workspace = path.join(root, relative.includes('@') ? 'scoped' : 'unscoped');
    const installed = path.join(workspace, relative);
    const dependency = path.join(workspace, 'skills/notion-api-automation/scripts');
    fs.mkdirSync(path.join(installed, 'scripts'), { recursive:true });
    fs.mkdirSync(dependency, { recursive:true });
    fs.writeFileSync(path.join(installed, 'package.json'), '{"type":"module"}');
    fs.copyFileSync(source, path.join(installed, 'scripts/notionctl_bridge.js'));
    fs.writeFileSync(path.join(dependency, 'notionctl.mjs'), 'console.log(JSON.stringify({ok:true,result:{fixture:true}}));');
    fs.writeFileSync(path.join(installed, 'probe.mjs'), "import {httpJson} from './scripts/notionctl_bridge.js'; console.log(JSON.stringify(httpJson('GET','/users/me')));");
    const result = spawnSync(process.execPath, [path.join(installed, 'probe.mjs')], { env, encoding:'utf8', timeout:5000 });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {fixture:true});
  }
});
