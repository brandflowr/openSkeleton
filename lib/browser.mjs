import {createValidator} from './core.mjs';
import checks from './generated/validators.cjs';
import keyfile from '../spec/skel-keyfile.json' with {type:'json'};
export const {validateDocument,validateStudio,validateDocumentShape}=createValidator(checks,keyfile);
export {parseDocument,ParseError,MAX_FILE_BYTES} from './parse.mjs';
