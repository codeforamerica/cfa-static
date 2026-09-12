import { describe, expect, test } from "vitest";
import * as exceptions from "#test/code-quality/code-quality-exceptions.js";
import { frozenSet } from "#utils/fp/set.js";

/**
 * Per-entry ratchet for test/code-quality/code-quality-exceptions.js.
 *
 * The central exceptions file is a deletion-only legacy baseline: entries
 * may only disappear, never be replaced. Any entry the baseline below does
 * not record fails as a new violation - including one slipped in to
 * balance out a deletion elsewhere, which a count-only ratchet would miss.
 * Any recorded entry that disappears fails with a ready-to-paste
 * replacement baseline so every deletion is locked in immediately.
 * Legitimate entry edits (a shifted line, a renamed export) surface as
 * both a removal and an addition and require an explicitly reviewed update.
 * The suggested replacement only removes entries; it never approves additions.
 */

const RATCHET_BASELINE = {
  ALLOWED_DATA_FALLBACKS: [],
  ALLOWED_DOM_CONSTRUCTOR: ["test/unit/code-quality/dom-mocking.test.js"],
  ALLOWED_LET: [
    "test/code-scanner.js",
    "test/integration/eleventy/feed.test.js",
    "test/integration/test-site-factory.test.js",
    "test/unit/code-quality/comment-limits.test.js",
    "test/unit/code-quality/commented-code.test.js",
    "test/unit/code-quality/design-system-scoping.test.js",
    "test/unit/code-quality/let-usage.test.js",
    "test/unit/code-quality/unused-classes.test.js",
    "test/unit/transforms/images.test.js",
  ],
  ALLOWED_MUTABLE_CONST: [
    "src/_lib/public/design-system.js:61",
    "src/_lib/public/masonry.js:11",
    "test/code-scanner.js",
    "test/test-runner-utils.js",
    "test/unit/code-quality/aliasing.test.js",
    "test/unit/code-quality/array-push.test.js",
    "test/unit/code-quality/comment-limits.test.js",
    "test/unit/code-quality/design-system-scoping.test.js",
    "test/unit/code-quality/duplicate-methods.test.js",
    "test/unit/code-quality/let-usage.test.js",
    "test/unit/code-quality/naming-conventions.test.js",
    "test/unit/code-quality/single-use-functions.test.js",
    "test/unit/code-quality/test-only-exports.test.js",
    "test/unit/code-quality/unused-classes.test.js",
    "test/unit/eleventy/layout-aliases.test.js",
    "test/unit/test-runner-utils.test.js",
    "test/unit/transforms/images.test.js",
    "test/unit/utils/object-entries.test.js",
    "test/unit/utils/set.test.js",
  ],
  ALLOWED_NULLISH_COALESCING: [
    "src/_data/eleventyComputed.js",
    "src/_lib/build/scss.js:27",
    "src/_lib/build/theme-compiler.js:59",
    "src/_lib/public/ui/autosizes.js:83",
    "src/_lib/utils/sorting.js:64",
  ],
  ALLOWED_PROCESS_CWD: [
    "test/test-utils/resource.js",
    "test/unit/utils/git-dates.test.js",
  ],
  ALLOWED_SINGLE_USE_FUNCTIONS: [
    "src/_data/eleventyComputed.js",
    "src/_lib/collections/navigation.js",
    "src/_lib/eleventy/breadcrumbs.js",
    "src/_lib/eleventy/file-utils.js",
    "src/_lib/eleventy/html-transform.js",
    "src/_lib/eleventy/style-bundle.js",
    "src/_lib/media/image-external.js",
    "src/_lib/media/image-utils.js",
    "src/_lib/media/thumbnail-placeholder.js",
    "src/_lib/public/design-system.js",
    "src/_lib/public/masonry.js",
    "src/_lib/public/theme/theme-editor-lib.js",
    "src/_lib/public/ui/gallery.js",
    "src/_lib/public/ui/image-popup.js",
    "src/_lib/public/ui/nav-dropdown.js",
    "src/_lib/public/ui/search.js",
    "src/_lib/public/ui/slider.js",
    "src/_lib/transforms/external-links.js",
    "src/_lib/transforms/linkify.js",
    "src/_lib/utils/block-columns.js",
    "src/_lib/utils/dom-builder.js",
    "test/test-runner-utils.js",
    "test/unit/code-quality/comment-limits.test.js",
    "test/unit/code-quality/duplicate-methods.test.js",
    "test/unit/code-quality/html-in-js.test.js",
  ],
  ALLOWED_TEST_ONLY_EXPORTS: [
    "src/_lib/build/scss.js:createScssCompiler",
    "src/_lib/eleventy/html-transform.js:createHtmlTransform",
    "src/_lib/eleventy/screenshots.js:captureScreenshots",
    "src/_lib/eleventy/screenshots.js:logScreenshotErrors",
    "src/_lib/media/browser-utils.js:buildOutputPath",
    "src/_lib/media/browser-utils.js:createOperationContext",
    "src/_lib/media/browser-utils.js:createOutputPathBuilder",
    "src/_lib/media/browser-utils.js:pathErrorInfo",
    "src/_lib/media/browser-utils.js:waitForServer",
    "src/_lib/media/image-frontmatter.js:isValidImage",
    "src/_lib/media/image-utils.js:getPathAwareBasename",
    "src/_lib/media/screenshot.js:takeScreenshotWithPlaywright",
    "src/_lib/media/thumbnail-placeholder.js:PLACEHOLDER_COLORS",
    "src/_lib/public/ui/gallery.js:initGallery",
    "src/_lib/public/ui/gallery.js:resolveStartIndex",
    "src/_lib/public/ui/image-popup.js:initImagePopup",
    "src/_lib/public/ui/nav-dropdown.js:initNavDropdown",
    "src/_lib/public/ui/search.js:createSearchController",
    "src/_lib/public/ui/search.js:handleSubmit",
    "src/_lib/public/ui/search.js:initSearch",
    "src/_lib/public/ui/search.js:loadPagefind",
    "src/_lib/public/ui/search.js:readQueryParam",
    "src/_lib/public/ui/search.js:renderResult",
    "src/_lib/utils/block-schema.js:validateBlocks",
    "src/_lib/utils/dom-builder.js:elementToHtml",
    "src/_lib/utils/dom-builder.js:getSharedDocument",
    "src/_lib/utils/fp/array.js:findDuplicate",
    "src/_lib/utils/fp/array.js:pick",
    "src/_lib/utils/fp/array.js:reduce",
    "src/_lib/utils/fp/array.js:uniqueBy",
    "src/_lib/utils/fp/grouping.js:buildFirstOccurrenceLookup",
    "src/_lib/utils/fp/grouping.js:buildReverseIndex",
    "src/_lib/utils/fp/grouping.js:groupBy",
    "src/_lib/utils/fp/grouping.js:groupValuesBy",
    "src/_lib/utils/fp/memoize.js:memoizeByRef",
    "src/_lib/utils/fp/object.js:mapBoth",
    "src/_lib/utils/fp/object.js:omit",
    "src/_lib/utils/fp/object.js:pickTruthy",
    "src/_lib/utils/fp/set.js:frozenSetFrom",
    "src/_lib/utils/fp/set.js:setHas",
    "src/_lib/utils/fp/set.js:setLacks",
    "src/_lib/utils/fp/sorting.js:compareBy",
    "src/_lib/utils/fp/sorting.js:descending",
    "src/_lib/utils/validate-item.js:validateItem",
  ],
  ALLOWED_TRY_CATCHES: [
    "scripts/customise-cms/index.js:179",
    "scripts/mutation/runner.js",
    "scripts/mutation/summary.js:219",
    "test/ensure-deps.js:16",
    "test/integration/pages-yml-validation.test.js:30",
    "test/test-utils/assertions.js",
  ],
};

const compareExceptions = (baseline, current) => ({
  added: Object.entries(current).flatMap(([name, set]) =>
    [...set]
      .filter((entry) => !baseline[name].includes(entry))
      .map((entry) => `${name}: ${entry}`),
  ),
  removed: Object.entries(baseline).flatMap(([name, entries]) =>
    entries
      .filter((entry) => !current[name].has(entry))
      .map((entry) => `${name}: ${entry}`),
  ),
  deletionOnlyBaseline: Object.fromEntries(
    Object.entries(baseline).map(([name, entries]) => [
      name,
      entries.filter((entry) => current[name].has(entry)),
    ]),
  ),
});

describe("exceptions-ratchet", () => {
  test.each([
    ["unchanged entries", ["legacy"], [], [], ["legacy"]],
    ["addition only", ["legacy", "new"], ["RULE: new"], [], ["legacy"]],
    ["deletion only", [], [], ["RULE: legacy"], []],
    ["replacement", ["new"], ["RULE: new"], ["RULE: legacy"], []],
  ])("compares %s without approving additions", (_name, entries, added, removed, retained) => {
    expect(
      compareExceptions({ RULE: ["legacy"] }, { RULE: frozenSet(entries) }),
    ).toEqual({ added, removed, deletionOnlyBaseline: { RULE: retained } });
  });

  test("deletion updates keep unrelated new exceptions rejected", () => {
    const current = { FIRST: frozenSet([]), SECOND: frozenSet(["new"]) };
    const { deletionOnlyBaseline } = compareExceptions(
      { FIRST: ["legacy"], SECOND: [] },
      current,
    );

    expect(compareExceptions(deletionOnlyBaseline, current).added).toEqual([
      "SECOND: new",
    ]);
  });

  test("every exported allowlist is a Set", () => {
    const nonSets = Object.entries(exceptions)
      .filter(([, set]) => !(set instanceof Set))
      .map(([name]) => name);

    expect(nonSets).toEqual([]);
  });

  test("baseline covers every exported allowlist", () => {
    expect(Object.keys(exceptions).sort()).toEqual(
      Object.keys(RATCHET_BASELINE).sort(),
    );
  });

  test("allowlists gain no entries the baseline does not record", () => {
    const { added } = compareExceptions(RATCHET_BASELINE, exceptions);

    if (added.length > 0) {
      console.log("\n  New code-quality exception entries:");
      for (const entry of added) {
        console.log(`    - ${entry}`);
      }
      console.log(
        "\n  The central exceptions file is deletion-only: fix the code or",
      );
      console.log(
        "  fix the check - never add entries for new violations. If an",
      );
      console.log(
        "  entry merely moved (renamed file, shifted line), request an",
      );
      console.log("  explicit review of that baseline update instead.");
    }

    expect(added).toEqual([]);
  });

  test("entries removed since the baseline are locked in", () => {
    const { removed, deletionOnlyBaseline } = compareExceptions(
      RATCHET_BASELINE,
      exceptions,
    );

    if (removed.length > 0) {
      console.log("\n  Allowlist entries no longer present:");
      for (const entry of removed) {
        console.log(`    - ${entry}`);
      }
      console.log("\n  Lock the win in - replace RATCHET_BASELINE with:\n");
      console.log(JSON.stringify(deletionOnlyBaseline, null, 2));
    }

    expect(removed).toEqual([]);
  });
});
