import yaml from 'js-yaml';

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_DEPTH = 64;
export const MAX_NODES = 200000;

export class ParseError extends Error {
  constructor(message, code = 'YAML_PARSE_ERROR') {
    super(message);
    this.name = 'ParseError';
    this.code = code;
    this.path = '';
  }
}

// Bound traversal before schema validators encounter cyclic or oversized data.
export function assertDataLimits(value) {
  const stack = [{value, depth: 0, exit: false}];
  const ancestors = new Set();
  let nodes = 0;
  while (stack.length) {
    const item = stack.pop();
    if (item.exit) { ancestors.delete(item.value); continue; }
    if (++nodes > MAX_NODES || item.depth > MAX_DEPTH) throw new ParseError('Document exceeds the size or nesting limit.', 'INPUT_LIMIT_EXCEEDED');
    if (!item.value || typeof item.value !== 'object') continue;
    if (ancestors.has(item.value)) throw new ParseError('Cyclic aliases are not supported in story files.', 'INPUT_LIMIT_EXCEEDED');
    ancestors.add(item.value);
    stack.push({...item, exit: true});
    for (const child of Object.values(item.value)) stack.push({value: child, depth: item.depth + 1, exit: false});
  }
}

export function parseDocument(source, {json = false} = {}) {
  if (typeof source !== 'string' || source.length > MAX_FILE_BYTES || new TextEncoder().encode(source).length > MAX_FILE_BYTES) {
    throw new ParseError('Story files must be 10 MB or smaller.', 'INPUT_LIMIT_EXCEEDED');
  }
  try {
    let nodes = 0;
    const value = json ? JSON.parse(source) : yaml.load(source, {
      maxDepth: MAX_DEPTH,
      maxTotalMergeKeys: 10000,
      listener(event) {
        if (event === 'open' && ++nodes > MAX_NODES) throw new ParseError('Document has too many values.', 'INPUT_LIMIT_EXCEEDED');
      },
    });
    assertDataLimits(value);
    return value;
  } catch (error) {
    if (error instanceof ParseError) throw error;
    throw new ParseError(error.message);
  }
}
