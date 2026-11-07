import type { SKELValidationResult, SKELError, StudioRegistry, Lifecycle } from '../types/skel.js';
export interface ValidationOptions {
  lifecycle?: Lifecycle;
  studio?: StudioRegistry;
  sidecars?: Record<string, unknown>;
}
export function validateDocument(document: unknown, options?: ValidationOptions): SKELValidationResult;
export function validateDocumentShape(document: unknown): SKELError[];
export function validateStudio(studio: unknown): {valid: boolean; errors: SKELError[]; warnings: SKELError[]};
export {parseDocument, ParseError, MAX_FILE_BYTES} from './parse.mjs';
