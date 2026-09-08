import { frozenSet } from "#utils/fp/set.js";

/** HTML void elements cannot contain children or require an end tag. */
export const VOID_ELEMENTS = frozenSet([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);
