/**
 * Centralized code quality exceptions
 *
 * All whitelisted/grandfathered code quality violations are defined here.
 * These should be removed over time as the codebase is refactored.
 *
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                              ⚠️  WARNING ⚠️                                ║
 * ║                                                                           ║
 * ║  DO NOT ADD NEW ENTRIES TO THIS FILE UNDER ANY CIRCUMSTANCES.             ║
 * ║                                                                           ║
 * ║  This file exists ONLY to track legacy code that predates our quality     ║
 * ║  standards. Every entry here represents technical debt that must be       ║
 * ║  eliminated, not expanded.                                                ║
 * ║                                                                           ║
 * ║  The ONLY valid changes to this file are DELETIONS.                       ║
 * ║                                                                           ║
 * ║  If your new code triggers a quality check failure:                       ║
 * ║    1. Fix the code to meet quality standards - no exceptions              ║
 * ║    2. If you believe the check is wrong, fix the check itself             ║
 * ║    3. There is no option 3 - adding exceptions is not allowed             ║
 * ║                                                                           ║
 * ║  PRs that add new entries to this file will be rejected.                  ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

import { frozenSet } from "#utils/fp/set.js";

// ============================================
// try/catch exceptions
// ============================================

// Add file:line for specific locations, or just file path to allow all try/catch in that file
const ALLOWED_TRY_CATCHES = frozenSet([
  // test/ensure-deps.js - Dependency checking utility
  // Needed: checks if dependencies are installed, needs try/catch for module resolution
  "test/ensure-deps.js:16",

  // test/integration/pages-yml-validation.test.js - Git clone may fail in offline environments
  // Needed: gracefully skips validation when GitHub is not reachable
  "test/integration/pages-yml-validation.test.js:30",

  // Pre-existing catches surfaced when this gate's coverage was extended to
  // scripts/ and bin/ - baseline entries, not new debt. Each one handles the
  // error loudly or with documented degradation, never by masking:
  // CLI arg-parse errors become a friendly usage message + exit 1
  "scripts/customise-cms/index.js:179",
  // Two justified catches: restoreAll must keep restoring the other
  // mutated files after one write fails (printed, fails the run via
  // process.exitCode), and a spawn failure means a mutant's tests never
  // ran, so sources are restored and the whole run fails loudly instead
  // of scoring a false pass.
  "scripts/mutation/runner.js",
  // GitHub step summary is best-effort cosmetics; a write failure must not
  // fail the mutation run (covered by an explicit test)
  "scripts/mutation/summary.js:219",

  // test/test-utils/assertions.js - expectAsyncThrows is the sanctioned
  // try/catch replacement for asserting async errors in tests
  "test/test-utils/assertions.js",
]);

// ============================================
// process.cwd() exceptions (test files only)
// ============================================

// Test files that legitimately need process.cwd() instead of rootDir.
// Most tests should import rootDir from test-utils.js instead.
const ALLOWED_PROCESS_CWD = frozenSet([
  // withChdirAsync must save and restore the real process.cwd()
  "test/test-utils/resource.js",
]);

// ============================================
// Let declarations exceptions
// ============================================

// Files that use 'let' for mutable variables.
// Prefer functional patterns (map/filter/reduce) or const with immutable updates.
// Only 'let moduleName = null;' is allowed for lazy loading without exceptions.
const ALLOWED_LET = frozenSet([
  // Test files with mutable state tracking

  "test/unit/code-quality/comment-limits.test.js",
  "test/unit/code-quality/commented-code.test.js",
]);

// ============================================
// Single-use unexported function exceptions
// ============================================

// Files with single-use functions that are intentionally kept for clarity.
// Remove files from this list as you refactor them.
const ALLOWED_SINGLE_USE_FUNCTIONS = frozenSet([
  "src/_lib/collections/navigation.js", // Search box builder kept separate for function length
  "src/_lib/public/masonry.js", // Card type measurers split to stay under complexity limit
  "src/_lib/eleventy/file-utils.js", // Filter callbacks extracted for strict type safety
  "src/_lib/eleventy/style-bundle.js", // Options parsing helpers for type safety
  "src/_lib/eleventy/html-transform.js", // Transform helpers kept separate to manage complexity
  "src/_lib/utils/block-columns.js", // Validation and distribution helpers kept separate for complexity
  "src/_lib/public/ui/gallery.js",
  "src/_lib/public/ui/image-popup.js", // Popup state updaters split to stay under complexity limit
  "src/_lib/public/design-system.js", // Parallax/marquee init helpers kept separate to manage complexity
  "test/unit/code-quality/comment-limits.test.js",
  "test/unit/code-quality/html-in-js.test.js",
  // Step-output parsing helpers kept separate for clarity. Surfaced by the
  // Node port: the scanner previously bailed on this file over a regex
  // literal inside a since-removed config parser, hiding these.
  "test/test-runner-utils.js",
]);

// ============================================
// Test-only exports exceptions
// ============================================

// Exports from src/ that are only used in test/ files.
// These indicate tests of implementation details rather than public API.
// Format: "path/to/file.js:exportName"
//
// NOTE: The scanner now detects Eleventy registrations (addFilter, addShortcode, etc.)
// so exports registered with Eleventy no longer need to be listed here.
const ALLOWED_TEST_ONLY_EXPORTS = frozenSet([
  // Generic fp utilities kept as a small standard library; some
  // functions are currently exercised only from test code
  "src/_lib/utils/fp/object.js:omit",
  "src/_lib/utils/fp/set.js:setHas", // Curried predicate for filter/some/every
  "src/_lib/utils/fp/grouping.js:groupBy", // Used by memoize.js and scripts/ via relative imports
  "src/_lib/utils/fp/grouping.js:buildFirstOccurrenceLookup", // Toolkit API surface
  "src/_lib/utils/fp/grouping.js:groupValuesBy", // Toolkit API surface
  "src/_lib/utils/fp/memoize.js:memoizeByRef", // Toolkit API surface
  "src/_lib/utils/fp/object.js:mapBoth", // Toolkit API surface
  "src/_lib/utils/fp/object.js:pickTruthy", // Toolkit API surface
  "src/_lib/utils/fp/array.js:findDuplicate", // Toolkit API surface
  "src/_lib/utils/fp/array.js:uniqueBy", // Toolkit API surface
  "src/_lib/utils/fp/sorting.js:descending", // Toolkit API surface

  // Browser-automation internals: consumed inside their own modules by the
  // exported orchestrators (startServer, screenshot, configureScreenshots),
  // exported so unit tests can exercise each piece directly.
  "src/_lib/media/browser-utils.js:buildOutputPath",
  "src/_lib/media/browser-utils.js:createOutputPathBuilder",
  "src/_lib/media/browser-utils.js:createOperationContext",
  "src/_lib/media/browser-utils.js:pathErrorInfo",
  "src/_lib/media/browser-utils.js:waitForServer",
  "src/_lib/media/screenshot.js:takeScreenshotWithPlaywright",
  "src/_lib/eleventy/screenshots.js:captureScreenshots",
  "src/_lib/eleventy/screenshots.js:logScreenshotErrors",

  // Registered through the PostHTML plugin wrapper so URL rewriting runs last.
  "src/_lib/eleventy/html-transform.js:createHtmlTransform",

  // DOM init functions - auto-called via onReady in production, but exported for unit tests
  // (ES modules execute at import time before tests can set up DOM)
  "src/_lib/public/ui/search.js:initSearch",
  "src/_lib/public/ui/search.js:renderResult",
  "src/_lib/public/ui/search.js:createSearchController",
  "src/_lib/public/ui/search.js:loadPagefind",
  "src/_lib/public/ui/search.js:readQueryParam",
  "src/_lib/public/ui/search.js:handleSubmit",
  "src/_lib/public/ui/nav-dropdown.js:initNavDropdown",
  "src/_lib/public/ui/gallery.js:initGallery",
  "src/_lib/public/ui/gallery.js:resolveStartIndex", // Throwing guard tested directly (happy-dom swallows listener errors)
  "src/_lib/public/ui/image-popup.js:initImagePopup",

  // Validation helpers - throwing wrappers tested directly
  "src/_lib/utils/validate-item.js:validateItem",
]);

// ============================================
// Data fallback exceptions
// ============================================

const ALLOWED_DATA_FALLBACKS = frozenSet([]);

// ============================================
// DOM class constructor exceptions
// ============================================

// Files allowed to use `new DOM()` for parsing HTML strings into documents.
// Most DOM tests should use `document` directly (via happy-dom GlobalRegistrator).
// Use `new DOM(html)` only when parsing generated HTML for assertions,
// NOT for mocking the global document.
const ALLOWED_DOM_CONSTRUCTOR = frozenSet([
  // This test file tests these patterns
  "test/unit/code-quality/dom-mocking.test.js",
]);

// ============================================
// Nullish coalescing (??) exceptions
// ============================================

// Files outside src/_lib/collections/ that use the ?? operator.
// Default values should be set early in the data chain (in collections).
// These are grandfathered usages that should be refactored over time.
const ALLOWED_NULLISH_COALESCING = frozenSet([
  // src/_data - user-facing data boundary (frontmatter from markdown files)
  // These are legitimate exceptions per CLAUDE.md: "User-provided input at system boundaries"
  "src/_data/eleventyComputed.js", // order, faqs, tab.body, metaComputed defaults
]);

export {
  ALLOWED_DATA_FALLBACKS,
  ALLOWED_DOM_CONSTRUCTOR,
  ALLOWED_LET,
  ALLOWED_NULLISH_COALESCING,
  ALLOWED_PROCESS_CWD,
  ALLOWED_SINGLE_USE_FUNCTIONS,
  ALLOWED_TEST_ONLY_EXPORTS,
  ALLOWED_TRY_CATCHES,
};
