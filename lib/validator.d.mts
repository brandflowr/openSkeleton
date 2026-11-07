export * from './browser.mjs';
export const SPEC_DIR: string;
export function loadDocument(path: string): unknown;
export function loadSidecarsNear(path: string): Record<string, unknown>;
