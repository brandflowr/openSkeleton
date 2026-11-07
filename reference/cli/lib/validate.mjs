// Repository development and installed CLI both consume the same spec-owned implementation.
import {existsSync, readFileSync} from 'node:fs';
const checkoutPackage = new URL('../../../package.json', import.meta.url);
const inCheckout = existsSync(checkoutPackage) && JSON.parse(readFileSync(checkoutPackage, 'utf8')).name === '@openskeleton/spec';
const implementation = await import(inCheckout ? new URL('../../../lib/validator.mjs', import.meta.url).href : '@openskeleton/spec/validator');
export const {loadDocument, validateDocument, validateStudio, validateDocumentShape, loadSidecarsNear, ParseError, parseDocument, SPEC_DIR} = implementation;
