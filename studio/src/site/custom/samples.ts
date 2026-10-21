import type { CustomDef } from '../schema';
import { checkCustomCode } from './check';
import { TIMELINE_CODE, TIMELINE_FIELDS } from './sample-code';

export { TIMELINE_CODE, TIMELINE_FIELDS };

export function timelineDef(purpose = 'The story of the business, year by year'): CustomDef {
  return { name: 'Timeline', purpose, fields: TIMELINE_FIELDS, code: TIMELINE_CODE, js: checkCustomCode(TIMELINE_CODE).js!, reviewed: false };
}
