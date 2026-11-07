import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import standaloneCode from 'ajv/dist/standalone/index.js';

const root=new URL('../',import.meta.url);
const ajv=new Ajv({allErrors:true,strict:true,strictRequired:false,allowUnionTypes:true,code:{source:true}});
addFormats(ajv);
const targets={skel:'skel.schema.json',studio:'studio.schema.json',videoMap:'video-map.schema.json',audioMap:'audio-map.schema.json',canvas:'canvas-layout.schema.json'};
const ids={};const digest=createHash('sha256');
for(const [key,file] of Object.entries(targets)) {
  const source=readFileSync(new URL(`spec/${file}`,root),'utf8');digest.update(source);
  const schema=JSON.parse(source);ajv.addSchema(schema);ids[key]=schema.$id;
}
const code=`// Generated from release schemas; do not edit. SHA256 ${digest.digest('hex')}\n`+standaloneCode(ajv,ids)+'\n';
const file=new URL('lib/generated/validators.cjs',root);
if(process.argv.includes('--check')) {
  if(!existsSync(file)||readFileSync(file,'utf8')!==code) throw new Error('Browser validators are stale; run npm run generate:validators.');
  console.error('Compiled browser validators match the current schemas.');
} else {
  mkdirSync(new URL('lib/generated/',root),{recursive:true});writeFileSync(file,code);console.log(`Generated ${fileURLToPath(file)}`);
}
