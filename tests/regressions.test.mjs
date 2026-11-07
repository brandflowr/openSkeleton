import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import * as nodeValidator from '../lib/validator.mjs';
import * as browserValidator from '../lib/browser.mjs';
import {parseDocument,MAX_FILE_BYTES} from '../lib/parse.mjs';
import {runHook,discoverMuscles,commandArguments} from '../reference/muscle-host/muscle-host.mjs';
import {applyOperation} from '../reference/muscle-host/json-patch.mjs';
import {fountainToSkel,skelToFountain} from '../reference/fountain-adapter/skel-fountain.mjs';

const root=dirname(dirname(fileURLToPath(import.meta.url)));
const read=relative=>JSON.parse(readFileSync(join(root,relative),'utf8'));
const sample=read('spec/example.skel.json');
const source=readFileSync(join(root,'reference/fountain-adapter/test/the-last-signal.fountain'),'utf8').replaceAll('\r\n','\n');

test('node and browser consumers agree across the complete conformance corpus',()=>{
  for(const entry of read('tests/conformance/manifest.json')) {
    const file=join(root,'tests/conformance',entry.file);
    if(!entry.file.endsWith('.json'))continue;
    const doc=nodeValidator.loadDocument(file);
    const opts={lifecycle:entry.lifecycle,...(entry.sidecars?{sidecars:nodeValidator.loadSidecarsNear(file)}:{})};
    assert.deepEqual(browserValidator.validateDocument(doc,opts),nodeValidator.validateDocument(doc,opts),entry.file);
  }
});
test('malformed document, registry and sidecar shapes yield diagnostics instead of exceptions',()=>{
  for(const change of [{acts:{}},{shots:[null]},{props:{}},{key_file:{custom:{}}},{acts:[{...sample.acts[0],scene_refs:{}}]}]) {
    const doc={...sample,...change};
    assert.equal(nodeValidator.validateDocument(doc).valid,false);
    assert.ok(browserValidator.validateDocumentShape(doc).length);
  }
  assert.equal(nodeValidator.validateStudio({characters:{}}).valid,false);
  assert.equal(nodeValidator.validateDocument(sample,{studio:{characters:{}}}).valid,false);
  for(const key of ['videoMap','audioMap','canvas']) assert.equal(nodeValidator.validateDocument(sample,{sidecars:{[key]:null}}).valid,false);
});
test('unsupported majors fail while compatible higher minors remain readable',()=>{
  assert.equal(browserValidator.validateDocument({...sample,skel_version:'99.0'}).errors[0].code,'UNSUPPORTED_VERSION');
  assert.equal(browserValidator.validateDocument({...sample,skel_version:'2.99'}).valid,true);
});
test('file and graph limits bound parsing and schema traversal',()=>{
  assert.throws(()=>parseDocument(' '.repeat(MAX_FILE_BYTES+1)),/10 MB/);
  assert.throws(()=>parseDocument('['.repeat(100)+'0'+']'.repeat(100)),/nesting/);
  assert.throws(()=>parseDocument('a: &a [*a]'),/Cyclic/);
  const cycle={};cycle.self=cycle;
  assert.equal(nodeValidator.validateDocument(cycle).errors[0].code,'INPUT_LIMIT_EXCEEDED');
});
test('CLI --json returns a structured result for malformed input',()=>{
  const dir=mkdtempSync(join(tmpdir(),'skel-input-'));
  try {
    const file=join(dir,'story.json');writeFileSync(file,JSON.stringify({...sample,acts:{}}));
    const result=spawnSync(process.execPath,[join(root,'reference/cli/skel.mjs'),'validate',file,'--json'],{encoding:'utf8'});
    assert.equal(result.status,1);assert.equal(JSON.parse(result.stdout).valid,false);assert.equal(result.stderr,'');
  } finally {rmSync(dir,{recursive:true,force:true});}
});

const makeEntry=(id,caps=['patch:shots'],hook='entity.changed')=>({path:join(root,'tests/probe.muscle.json'),manifest:{muscle_id:id,muscle_version:'1.0.0',label:id,capabilities:caps,hooks:[{on:hook,mode:'transform'}],execution_routes:[{type:'cli',command:'node fixtures/return-result.mjs'}]}});
function patchResult(patches,caps,setup=()=>{},extra={}) {
  const document=structuredClone(sample);setup(document);const before=structuredClone(document);
  const entry=makeEntry('probe',caps,extra.hook??'entity.changed');
  const result=runHook(extra.hook??'entity.changed',{muscles:[entry],document,subject:extra.subject,context:{config:{probe:{payload_version:'1.1',ok:true,patches,...extra.result}}}});
  return {document,before,result};
}
test('capabilities include move source, ancestor effects, and host-owned metadata',()=>{
  for(const [patch,caps] of [
    [{op:'move',from:'/metadata/title',path:'/shots/0/extensions/x-test'},['patch:extensions.x-test']],
    [{op:'replace',path:'/shots/0',value:{...sample.shots[0],v_setup:{...sample.shots[0].v_setup,size:'ecu'}}},['patch:shots']],
    [{op:'replace',path:'/metadata',value:{...sample.metadata,plugins:[{id:'forged',version:'1.0.0'}]}},['patch:metadata']],
    [{op:'add',path:'/shots/0/__proto__/polluted',value:true},['patch:shots']],
  ]) {
    const {document,before,result}=patchResult([patch],caps);
    assert.equal(result.ran[0].ok,false);assert.deepEqual(document,before);
  }
  assert.equal({}.polluted,undefined);
});
test('locked entities survive ancestor edits and sequential index shifts',()=>{
  const caps=['patch:shots','patch:v_setup','patch:shot.bones'];
  const cases=[
    [{op:'replace',path:'/shots',value:[{...sample.shots[0],action:'Changed'}]}],
    [{op:'remove',path:'/shots/0'},{op:'replace',path:'/shots/0/action',value:'Changed'}],
  ];
  for(const patches of cases) {
    const {document,before,result}=patchResult(patches,caps,doc=>doc.shots[1].creative_status='locked');
    assert.equal(result.ran[0].ok,false);assert.match(result.ran[0].note,/Locked/);assert.deepEqual(document,before);
  }
});
test('invalid patches roll back document and derived subject together',()=>{
  const {document,before,result}=patchResult([{op:'replace',path:'/metadata/title',value:'forbidden'}],['patch:shots'],()=>{},
    {hook:'prompt.assemble.after',subject:{assembled_prompt:'original'},result:{subject_replacement:'changed'}});
  assert.equal(result.ran[0].ok,false);assert.deepEqual(document,before);assert.equal(result.subject.assembled_prompt,'original');
  const invalid=patchResult([{op:'replace',path:'/shots/0/action',value:123}],['patch:shots']);
  assert.equal(invalid.result.ran[0].ok,false);assert.deepEqual(invalid.document,invalid.before);
});
test('plugins see the preceding committed subject and accept payload 1.0',()=>{
  const entries=[makeEntry('one',[],'prompt.assemble.after'),makeEntry('two',[],'prompt.assemble.after')];
  const result=runHook('prompt.assemble.after',{muscles:entries,document:structuredClone(sample),subject:{assembled_prompt:'base'},context:{config:{one:{payload_version:'1.0',ok:true,subject_replacement:'first'},two:{append:' second'}}}});
  assert.equal(result.subject.assembled_prompt,'first second');assert.ok(result.ran.every(r=>r.ok));
});
test('JSON Patch respects pointer, array, equality, value and move semantics',()=>{
  assert.deepEqual(applyOperation({a:{x:1,y:2}},{op:'test',path:'/a',value:{y:2,x:1}}),{a:{x:1,y:2}});
  assert.deepEqual(applyOperation({a:[1,2]},{op:'move',from:'/a/0',path:'/a/1'}),{a:[2,1]});
  for(const op of [{op:'replace',path:'/a/01',value:3},{op:'remove',path:'/a/-'},{op:'add',path:'/a/0'},{op:'move',from:'/a',path:'/a/b'}]) assert.throws(()=>applyOperation({a:[1]},op));
  assert.deepEqual(commandArguments('node "a folder/plugin.mjs"'),['node','a folder/plugin.mjs']);
  assert.throws(()=>commandArguments('node plugin.mjs | echo bad'),/Shell/);
});
test('real shipped continuity and Fountain plugins work through the host',()=>{
  const muscles=discoverMuscles([join(root,'spec/muscles')]);
  const continuity=runHook('document.validate',{muscles:muscles.filter(m=>m.manifest.muscle_id==='continuity-guard'),document:structuredClone(sample),lifecycle:'production'});
  assert.equal(continuity.ran[0].ok,true);
  const doc=structuredClone(sample);doc.metadata.extensions={'x-existing':{keep:true}};
  const result=runHook('import.after',{muscles:muscles.filter(m=>m.manifest.muscle_id==='fountain-adapter'),document:doc,subject:{format:'fountain',source_text:source}});
  assert.equal(result.ran[0].ok,true,JSON.stringify(result.ran));assert.deepEqual(doc.metadata.extensions['x-existing'],{keep:true});assert.ok(doc.metadata.extensions['x-fountain']);
});

test('Fountain export preserves long action edits, title and author changes',()=>{
  const doc=fountainToSkel(source);const shot=doc.shots.find(s=>s.extensions?.['x-fountain']?.full_action);
  const old=shot.extensions['x-fountain'].full_action;shot.action='A completely different action.';
  doc.metadata.title='Changed title';doc.metadata.author='Changed author';
  const output=skelToFountain(doc);assert.ok(output.includes(shot.action));assert.ok(!output.includes(old));assert.ok(output.includes('Title: Changed title'));assert.ok(output.includes('Author: Changed author'));
});
test('Fountain export reflects dialogue speakers, modes, additions and removals',()=>{
  const doc=fountainToSkel(source);const shot=doc.shots.find(s=>s.dialogue?.length);
  const line=shot.dialogue[0];doc.characters.find(c=>c.id===line.character_ref).name='RENAMED';line.mode='os';
  shot.dialogue.push({text:'An added line.',character_ref:line.character_ref});
  let output=skelToFountain(doc);assert.ok(output.includes('RENAMED (O.S.)'));assert.ok(output.includes('An added line.'));
  const removedText=line.text;delete shot.dialogue;output=skelToFountain(doc);assert.ok(!output.includes(removedText));assert.ok(!output.includes('An added line.'));
});
test('Fountain export follows current shot membership and canonical order',()=>{
  const doc=fountainToSkel(source);const scene=doc.scenes.find(s=>s.shot_refs.length>1);
  const first=doc.shots.find(s=>s.id===scene.shot_refs[0]);const second=doc.shots.find(s=>s.id===scene.shot_refs[1]);
  first.action='FIRST UNIQUE ACTION';second.action='SECOND UNIQUE ACTION';
  scene.shot_refs.reverse();let output=skelToFountain(doc);assert.ok(output.indexOf(second.action)<output.indexOf(first.action));
  scene.shot_refs=scene.shot_refs.filter(id=>id!==first.id);
  doc.shots.push({id:'new_shot',scene_id:scene.id,action:'NEW UNIQUE ACTION',v_setup:{size:'ms',angle:'eye'}});scene.shot_refs.push('new_shot');
  output=skelToFountain(doc);assert.ok(!output.includes(first.action));assert.ok(output.includes('NEW UNIQUE ACTION'));
});
