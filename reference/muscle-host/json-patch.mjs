import {isDeepStrictEqual} from 'node:util';

export function pointer(path) {
  if (typeof path !== 'string' || !/^(\/([^/~]|~0|~1)*)*$/.test(path)) throw new Error('Invalid JSON pointer');
  const tokens = path === '' ? [] : path.slice(1).split('/').map(s => s.replace(/~1/g,'/').replace(/~0/g,'~'));
  if (tokens.some(t => ['__proto__','prototype','constructor'].includes(t))) throw new Error('Unsafe JSON pointer');
  return tokens;
}
export const escapePointer = key => String(key).replace(/~/g,'~0').replace(/\//g,'~1');
function arrayIndex(key, length, adding = false) {
  if (adding && key === '-') return length;
  if (!/^(0|[1-9]\d*)$/.test(key)) throw new Error('Invalid array index');
  const index = Number(key);
  if (!Number.isSafeInteger(index) || index >= length + Number(adding)) throw new Error('Array index out of range');
  return index;
}
export function getAt(doc, tokens) {
  let value = doc;
  for (const token of tokens) {
    if (value === null || typeof value !== 'object') throw new Error('Path does not exist');
    const key = Array.isArray(value) ? arrayIndex(token, value.length) : token;
    if (!Object.hasOwn(value, key)) throw new Error('Path does not exist');
    value = value[key];
  }
  return value;
}
export function applyOperation(doc, operation) {
  const {op, path} = operation;
  const tokens = pointer(path);
  if (!['add','remove','replace','move','copy','test'].includes(op)) throw new Error('Unknown JSON Patch operation');
  if (['add','replace','test'].includes(op) && !Object.hasOwn(operation,'value')) throw new Error('Patch value is required');
  if (op === 'test') {
    if (!isDeepStrictEqual(getAt(doc,tokens),operation.value)) throw new Error(`Test failed at ${path}`);
    return doc;
  }
  if (op === 'copy' || op === 'move') {
    const from = pointer(operation.from);
    if (op === 'move' && tokens.length > from.length && from.every((t,i) => t === tokens[i])) throw new Error('Cannot move into a descendant');
    const value = structuredClone(getAt(doc,from));
    if (op === 'move') doc = applyOperation(doc,{op:'remove',path:operation.from});
    return applyOperation(doc,{op:'add',path,value});
  }
  if (!tokens.length) {
    if (op === 'remove') return undefined;
    return structuredClone(operation.value);
  }
  const parent = getAt(doc,tokens.slice(0,-1));
  if (!parent || typeof parent !== 'object') throw new Error('Patch parent is not a container');
  const token = tokens.at(-1);
  if (Array.isArray(parent)) {
    const index = arrayIndex(token,parent.length,op === 'add');
    if (op === 'add') parent.splice(index,0,structuredClone(operation.value));
    else if (op === 'remove') parent.splice(index,1);
    else parent[index] = structuredClone(operation.value);
  } else {
    if (op !== 'add' && !Object.hasOwn(parent,token)) throw new Error(`Patch target does not exist: ${path}`);
    if (op === 'remove') delete parent[token];
    else parent[token] = structuredClone(operation.value);
  }
  return doc;
}

// Leaf effects enforce narrower capabilities even when a patch replaces an ancestor.
export function changedPaths(before, after, base = '') {
  if (isDeepStrictEqual(before,after)) return [];
  const a = before !== null && typeof before === 'object';
  const b = after !== null && typeof after === 'object';
  if (!a && !b) return [base];
  const keys = new Set([...Object.keys(a ? before : {}), ...Object.keys(b ? after : {})]);
  if (!keys.size) return [base];
  return [...keys].flatMap(key => changedPaths(a ? before[key] : undefined,b ? after[key] : undefined,`${base}/${escapePointer(key)}`));
}
