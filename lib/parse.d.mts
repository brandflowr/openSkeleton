export const MAX_FILE_BYTES: number;
export class ParseError extends Error { code: string; path: string; }
export function parseDocument(source: string, options?: {json?: boolean}): unknown;
export function assertDataLimits(value: unknown): void;
