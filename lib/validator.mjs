import {readFileSync,existsSync,statSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createValidator} from './core.mjs';
import checks from './generated/validators.cjs';
import {parseDocument,ParseError,MAX_FILE_BYTES} from './parse.mjs';
export {ParseError,parseDocument} from './parse.mjs';
export const SPEC_DIR = fileURLToPath(new URL('../spec/',import.meta.url));
const read = name => JSON.parse(readFileSync(join(SPEC_DIR,name),'utf8'));
export const {validateDocument,validateStudio,validateDocumentShape} = createValidator(checks,read('skel-keyfile.json'));
export function loadDocument(filePath) {
  if (statSync(filePath).size > MAX_FILE_BYTES) throw new ParseError('Story files must be 10 MB or smaller.', 'INPUT_LIMIT_EXCEEDED');
  return parseDocument(readFileSync(filePath,'utf8'), {json:filePath.endsWith('.json')});
}
const err = (code,path,message) => ({code,path,message,severity:'error'});
// ── Sidecar discovery next to a document ───────────────────────────────────────
export function loadSidecarsNear(docPath) {
  const dir = dirname(resolve(docPath));
  const out = {};
  const tryLoad = (rel, key) => {
    const p = join(dir, rel);
    if (!existsSync(p)) return;
    try {
      out[key] = loadDocument(p);
    } catch (e) {
      out[`${key}ParseError`] = err("SIDECAR_PARSE_ERROR", rel, e.message);
    }
  };
  tryLoad("video-map.json", "videoMap");
  tryLoad("audio-map.json", "audioMap");
  tryLoad(join("canvas", "layout.json"), "canvas");
  return out;
}


