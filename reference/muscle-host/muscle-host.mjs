// Reference MUSCLE 1.1 host: trusted CLI execution and transactional document patches.
import {readFileSync, readdirSync, existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {join, dirname, resolve} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import {SPEC_DIR, validateDocument, validateDocumentShape} from '../../lib/validator.mjs';
import {assertDataLimits} from '../../lib/parse.mjs';
import {pointer, getAt, applyOperation, changedPaths} from './json-patch.mjs';

export const PAYLOAD_VERSION = '1.1';
const readSchema = name => JSON.parse(readFileSync(join(SPEC_DIR,name),'utf8'));
const manifestSchema = readSchema('muscle.schema.json');
const payloadSchema = readSchema('hook-payload.schema.json');
export const HOOKS = payloadSchema.definitions.HookEnvelope.properties.hook.enum;
const ajv = new Ajv({allErrors:true,strict:false});
addFormats(ajv);
ajv.addSchema(payloadSchema);
const checkManifest = ajv.compile(manifestSchema);
const checkEnvelope = ajv.compile({$ref:payloadSchema.$id+'#/definitions/HookEnvelope'});
const checkResult = ajv.compile({$ref:payloadSchema.$id+'#/definitions/HookResult'});
const errorsOf = check => (check.errors ?? []).map(e => `${e.instancePath || '/'} ${e.message}`);
export function validateManifest(manifest) {
  return checkManifest(manifest) ? [] : errorsOf(checkManifest);
}

export function discoverMuscles(dirs) {
  const found = new Map();
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).filter(f => f.endsWith('.muscle.json')).sort()) {
      const path = join(dir,file);
      try {
        const manifest = JSON.parse(readFileSync(path,'utf8'));
        const errors = validateManifest(manifest);
        if (errors.length) throw new Error(errors.join('; '));
        found.set(manifest.muscle_id,{manifest,dir:resolve(dir),path});
      } catch (error) { console.error(`[muscle-host] skipping ${path}: ${error.message}`); }
    }
  }
  return [...found.values()];
}

export function patchAllowed(caps,path) {
  const t = pointer(path);
  if (t[0] === 'metadata' && t[1] === 'plugins') return false;
  const extension = t.indexOf('extensions');
  if (extension !== -1 && t[extension+1]?.startsWith('x-') && caps.includes(`patch:extensions.${t[extension+1]}`)) return true;
  if (t[0] === 'metadata') return caps.includes('patch:metadata');
  if (t[0] === 'shots' && t[2] === 'bones') return caps.includes('patch:shot.bones');
  if (t[0] === 'scenes' && t[2] === 'bones') return caps.includes('patch:scene.bones');
  if (t[0] === 'shots' && t[2] === 'v_setup') return caps.includes('patch:v_setup');
  return ['acts','scenes','shots','characters','environments','props'].includes(t[0]) && caps.includes(`patch:${t[0]}`);
}

const collections = ['acts','scenes','shots','characters','environments','props'];
function checkLockedPath(path,doc) {
  const t = pointer(path);
  if (!collections.includes(t[0])) return;
  const entities = t.length === 1 ? doc[t[0]] : [doc[t[0]]?.[t[1]]];
  if (entities?.some(e => e?.creative_status === 'locked')) throw new Error(`Locked entity at ${path}`);
}
function checkEffects(before,after,caps) {
  for (const path of changedPaths(before,after)) {
    if (!patchAllowed(caps,path)) throw new Error(`Outside capabilities: ${path}`);
  }
  if (!isDeepStrictEqual(before.metadata?.plugins,after.metadata?.plugins)) throw new Error('metadata.plugins is host-owned');
  for (const key of collections) {
    for (const entity of before[key] ?? []) {
      if (entity.creative_status === 'locked' && !isDeepStrictEqual(entity,after[key]?.find(e => e.id === entity.id))) throw new Error(`Locked entity: ${entity.id}`);
    }
  }
}
function vivifyExtensions(doc,path) {
  const tokens = pointer(path);
  const i = tokens.indexOf('extensions');
  if (i < 0 || !tokens[i+1]?.startsWith('x-')) return;
  const parent = getAt(doc,tokens.slice(0,i));
  if (parent && typeof parent === 'object' && parent.extensions === undefined) parent.extensions = {};
}
export function sanityCheck(doc) { return validateDocument(doc).errors.map(e => `${e.path} ${e.message}`); }

// Parse quoting only. No shell, expansion, pipes, or redirection is ever invoked.
export function commandArguments(command) {
  if (typeof command !== 'string') throw new Error('CLI route needs a command');
  const args = []; let word = ''; let quote = null; let started = false;
  for (let i=0;i<command.length;i++) {
    const c = command[i];
    if (quote) {
      if (c === quote) quote = null;
      else if (c === '\\' && command[i+1] === quote) word += command[++i];
      else word += c;
    } else if (c === '"' || c === "'") { quote=c; started=true; }
    else if (/\s/.test(c)) { if (started) {args.push(word);word='';started=false;} }
    else { if (/[|&;<>]/.test(c)) throw new Error('Shell operators are not supported'); word+=c;started=true; }
  }
  if (quote) throw new Error('Unclosed command quote');
  if (started) args.push(word);
  if (!args.length || !args[0]) throw new Error('Empty CLI command');
  return args;
}
function invoke(entry,envelope,timeout) {
  const route=entry.manifest.execution_routes.find(r=>r.type==='cli');
  if (!route) throw new Error('No available execution route');
  const [command,...args]=commandArguments(route.command);
  const result=spawnSync(command === 'node' ? process.execPath : command,args,{
    shell:false,cwd:dirname(entry.path),input:JSON.stringify(envelope),encoding:'utf8',timeout:timeout ?? 30000,windowsHide:true,maxBuffer:1024*1024,
  });
  if (result.error || result.status!==0) throw new Error(`Route failed: ${result.error?.message ?? result.stderr ?? result.status}`);
  const value=JSON.parse(result.stdout);assertDataLimits(value);return value;
}
function filterMatch(filter,subject) {
  return !filter || ((!filter.formats || filter.formats.includes(subject?.format)) && (!filter.bone_ids || filter.bone_ids.includes(subject?.bone_id)) && (!filter.entities || filter.entities.includes(subject?.entity)));
}

export function runHook(hook,{muscles,document,subject,lifecycle='draft',context={}}) {
  const report={hook,ran:[],errors:[],warnings:[],subject};
  const subscribers=muscles.flatMap(entry=>(entry.manifest.hooks??[]).filter(sub=>sub.on===hook).map(sub=>({entry,sub})))
    .sort((a,b)=>(a.sub.priority??100)-(b.sub.priority??100));
  for (const {entry,sub} of subscribers) {
    if (!filterMatch(sub.filter,report.subject)) continue;
    const id=entry.manifest.muscle_id;
    const caps=entry.manifest.capabilities;
    try {
      const manifestErrors=validateManifest(entry.manifest);
      if (manifestErrors.length) throw new Error(manifestErrors.join('; '));
      const config=context.config?.[id]??{};
      if (entry.manifest.config_schema && !ajv.compile(entry.manifest.config_schema)(config)) throw new Error('Invalid plugin configuration');
      const envelope={payload_version:PAYLOAD_VERSION,hook,muscle_id:id,lifecycle,
        context:{workspace_root:context.workspace_root??process.cwd(),project_slug:context.project_slug??'demo',config},
        ...(caps.includes('read:document')?{document}:{}),...(report.subject!==undefined?{subject:report.subject}:{}),
      };
      if (!checkEnvelope(envelope)) throw new Error(`Invalid envelope: ${errorsOf(checkEnvelope).join('; ')}`);
      const result=invoke(entry,envelope,sub.timeout_ms);
      if (!checkResult(result) || !/^1\./.test(result.payload_version)) throw new Error('Malformed or unsupported result');
      if (!result.ok) throw new Error('Plugin reported failure');
      if (sub.mode!=='transform' && (result.patches?.length || result.subject_replacement!==undefined)) throw new Error(`Mode ${sub.mode} cannot transform`);
      if (sub.mode!=='veto' && result.errors?.length) throw new Error(`Mode ${sub.mode} cannot veto`);
      let nextSubject=report.subject;
      if (result.subject_replacement!==undefined) {
        if (hook==='generate.route') {
          const chosen=report.subject?.routes?.find(r=>isDeepStrictEqual(r,result.subject_replacement));
          if (!chosen) throw new Error('Replacement is not a candidate route');
          nextSubject={...report.subject,chosen_route:chosen};
        } else if (hook==='prompt.assemble.after') {
          if (typeof result.subject_replacement!=='string') throw new Error('Prompt replacement must be a string');
          nextSubject={...report.subject,assembled_prompt:result.subject_replacement};
        } else throw new Error(`Subject replacement is not supported for ${hook}`);
      }
      if (result.patches?.length) {
        let staged=structuredClone(document);
        for (const patch of result.patches) {
          if (patch.op==='test') {
            if (!caps.includes('read:document')) throw new Error('test requires read:document');
          } else {
            if (!patchAllowed(caps,patch.path)) throw new Error(`Outside capabilities: ${patch.path}`);
            checkLockedPath(patch.path,staged);
          }
          if (patch.op==='move') {
            if (!patchAllowed(caps,patch.from)) throw new Error(`Outside capabilities: ${patch.from}`);
            checkLockedPath(patch.from,staged);
          }
          if (patch.op==='copy' && !caps.includes('read:document')) throw new Error('copy requires read:document');
          const before=structuredClone(staged);
          if (patch.op==='add') vivifyExtensions(staged,patch.path);
          staged=applyOperation(staged,patch);
          checkEffects(before,staged,caps);
        }
        const invalid=validateDocumentShape(staged);
        if (invalid.length) throw new Error(`Document invalid after patches: ${invalid[0].message}`);
        const validation=validateDocument(staged);
        if (!validation.valid) throw new Error(`Document invalid after patches: ${validation.errors[0].message}`);
        staged.metadata.plugins??=[];
        const stamp={id,version:entry.manifest.muscle_version,last_ran:new Date().toISOString()};
        const existing=staged.metadata.plugins.find(p=>p.id===id);
        if (existing) Object.assign(existing,stamp);else staged.metadata.plugins.push(stamp);
        Object.keys(document).forEach(key=>delete document[key]);Object.assign(document,staged);
      }
      report.subject=nextSubject;
      report.warnings.push(...result.warnings??[]);
      report.errors.push(...result.errors??[]);
      report.ran.push({muscle_id:id,ok:true,applied:result.patches?.length??0});
    } catch (error) {
      report.ran.push({muscle_id:id,ok:false,note:error.message});
      if (sub.mode==='veto' && lifecycle!=='draft') report.errors.push({code:`${id}.host_failure`,severity:'error',path:'',message:error.message});
    }
  }
  return report;
}
