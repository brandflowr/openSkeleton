import {mkdtempSync,writeFileSync,readFileSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync,spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';

const root=fileURLToPath(new URL('../',import.meta.url));
if(!process.env.npm_execpath) throw Error('Run npm run test:package.');
const temp=mkdtempSync(join(tmpdir(),'skel-package-'));
function npm(args,cwd=root){return execFileSync(process.execPath,[process.env.npm_execpath,...args],{cwd,encoding:'utf8',stdio:['ignore','pipe','inherit']});}
try {
  const spec=JSON.parse(npm(['pack','--json','--pack-destination',temp]))[0].filename;
  const cli=JSON.parse(npm(['pack','--json','--pack-destination',temp],join(root,'reference/cli')))[0].filename;
  const consumer=join(temp,'consumer');mkdirSync(consumer);writeFileSync(join(consumer,'package.json'),JSON.stringify({private:true,type:'module'}));
  npm(['install','--ignore-scripts','--audit=false','--fund=false',join(temp,spec),join(temp,cli)],consumer);
  const pkg=join(consumer,'node_modules/@openskeleton/spec');
  const command=join(consumer,'node_modules/@openskeleton/cli/skel.mjs');
  const valid=spawnSync(process.execPath,[command,'validate',join(pkg,'spec/example.skel.json'),'--json'],{cwd:consumer,encoding:'utf8'});
  assert.equal(valid.status,0,valid.stderr);assert.equal(JSON.parse(valid.stdout).valid,true);
  const malformed=join(consumer,'bad.skel.json');writeFileSync(malformed,'{"acts":{}}');
  const invalid=spawnSync(process.execPath,[command,'validate',malformed,'--json'],{cwd:consumer,encoding:'utf8'});
  assert.equal(invalid.status,1);assert.equal(JSON.parse(invalid.stdout).valid,false);assert.equal(invalid.stderr,'');
  const probe=join(consumer,'probe.mjs');writeFileSync(probe,`
    import assert from 'node:assert/strict';
    import {readFileSync} from 'node:fs';
    import {validateDocument} from '@openskeleton/spec/validator/browser';
    import {discoverMuscles,runHook} from './node_modules/@openskeleton/spec/reference/muscle-host/muscle-host.mjs';
    const document=JSON.parse(readFileSync('./node_modules/@openskeleton/spec/spec/example.skel.json','utf8'));
    assert(validateDocument(document).valid);
    const muscles=discoverMuscles(['./node_modules/@openskeleton/spec/spec/muscles']);
    const report=runHook('document.validate',{muscles:muscles.filter(m=>m.manifest.muscle_id==='continuity-guard'),document});
    assert.equal(report.ran.length,1);assert(report.ran[0].ok,JSON.stringify(report));
  `);
  execFileSync(process.execPath,[probe],{cwd:consumer,stdio:'inherit'});
  console.log('Packed spec and CLI install independently; browser validator, CLI JSON diagnostics, and shipped continuity route pass.');
} finally {
  // Only remove the unique directory created by this test under the OS temp root.
  if(dirname(resolve(temp))!==resolve(tmpdir()) || !temp.startsWith(join(tmpdir(),'skel-package-'))) throw Error('Unexpected temporary directory');
  rmSync(temp,{recursive:true,force:true});
}
