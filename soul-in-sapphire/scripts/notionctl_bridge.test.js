import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('validation errors do not masquerade as auth failures and known tokens stay redacted', () => {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'sis-error-hint-'));
 const mock=path.join(root,'notionctl.mjs'),probe=path.join(root,'probe.mjs');
 const bridge=new URL('./notionctl_bridge.js',import.meta.url).href;
 fs.writeFileSync(mock,"console.log(JSON.stringify({ok:false,error:process.env.SIS_FIXTURE_FAILURE,details:'fixture-secret-value'}));");
 fs.writeFileSync(probe,"import {httpJson} from "+JSON.stringify(bridge)+";try{httpJson('GET','/users/me')}catch(e){console.log(e.message)}");
 for(const code of ['validation_error','unauthorized']){
  const env={...process.env,NOTIONCTL_PATH:mock,NOTION_API_KEY:'fixture-secret-value',SIS_FIXTURE_FAILURE:code};
  delete env.NOTION_TOKEN;delete env.NOTION_API_TOKEN;
  const r=spawnSync(process.execPath,[probe],{encoding:'utf8',env,timeout:5000});
  assert.equal(r.status,0,r.stderr);assert.doesNotMatch(r.stdout,/fixture-secret-value/);
  if(code==='validation_error'){assert.match(r.stdout,/target database/);assert.doesNotMatch(r.stdout,/Configure Notion auth/);}
  else assert.match(r.stdout,/Configure Notion auth/);
 }
});


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
