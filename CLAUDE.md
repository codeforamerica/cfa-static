# Engineering Guide

CfA Static is an Eleventy template for informational and marketing sites, with
schema-validated YAML content blocks, multilingual publishing, responsive media,
themes, search, and a generated PagesCMS editing layer. It is not an e-commerce,
form-processing, or user-data application.

This is the canonical handwritten engineering policy and workflow. Consult:

- [Site Builder Reference](docs/developer-reference.md) for the Node requirement, installation, selected site-building commands, CMS options, and authoring links.
- [package.json](package.json) for all scripts and import aliases; [biome.json](biome.json) for configured lint rules and scopes; [FP source JSDoc](src/_lib/utils/fp/) for helper APIs.
- [Library map](src/_lib/README.md) for architecture and extension points.
- [Test quality criteria](test/TEST-QUALITY-CRITERIA.md) for the mandatory test standards. Apply every criterion; do not duplicate that checklist elsewhere.
- [Block reference](skills/cfa-static-site-builder/references/blocks.md) for the generated content model and block authoring API; [layouts](skills/cfa-static-site-builder/references/layouts.md) for authored rendering guidance.

## Change Workflow

1. Read the relevant source, tests, and configuration before editing. Follow surrounding conventions and preserve unrelated worktree changes.
2. Make the smallest correct change. Prefer existing helpers and clear, small functions over new abstractions or duplicated logic.
3. Add behavioral tests using the canonical test criteria and the shared helpers exported by `#test/test-utils.js`.
4. Run focused tests while iterating, then the relevant quality gates and lint. Regenerate affected artifacts and check the diff.
5. Run the full `npm test` once at the end before committing. Report commands, results, and any verification that could not run. Commit only when requested.

Use **npm**, not bun, yarn, or pnpm; maintain `package-lock.json` when dependencies
change. Install with `npm install`; see the generated reference for the current
Node requirement and `package.json` for command definitions. Do not describe scripts from memory.

## Code Policy

- Use Node subpath import aliases from `package.json`, not relative imports where an alias applies. Repository paths come from `ROOT_DIR` in `#lib/paths.js`, not `process.cwd()`.
- Prefer arrow functions, `const`, curried helpers, and immutable transformations. Use `pipe` when it makes a transformation clearer; do not force composition or extract helpers solely to add indirection.
- Use `map`/`filter` for transformations, `flatMap` for combined filtering/expansion, `reduce` for aggregation, and `Object.fromEntries` for object construction. Do not replace mutation with accumulating array/object spread: that can be quadratic and violates Biome's accumulating-spread rule.
- Do not assume `.push()` is an allowed alternative. `test/unit/code-quality/array-push.test.js` scans source with an empty allowlist; `object-mutation.test.js` similarly gates bracket assignment. `let-usage.test.js` has different scopes, exempt directories, and specific allowlists. Read the relevant gate before choosing an implementation, including inside reducers.
- Biome and code-quality tests are complementary. Read `biome.json` for actual Biome limits and overrides, not an invented universal scope. Do not broaden enforcement or weaken checks merely to accommodate a change.
- Keep HTML rendering in templates under `src/_includes/`; use existing block, shortcode, and filter registration patterns. Remove dead/commented-out code rather than retaining it as documentation.

Generic functional helpers live under `#utils/fp/`. In particular, memoization is
imported from `#utils/fp/memoize.js`, not `#utils/memoize.js`. Create cached helpers
at module scope so calls reuse the cache; use reference-based caching for
collection lookups where appropriate. Consult the [FP source JSDoc](src/_lib/utils/fp/)
for APIs rather than copying stale utility inventories.

### Fail Fast, Never Mask

Unexpected or invalid state must throw a clear error at its origin. Do not hide
errors behind fallback objects, empty collections, placeholder labels, or
`{ ok: false, error }` results that callers can silently ignore. Let errors
propagate unless the boundary has an explicit, justified recovery contract.

Normalize legitimate content defaults early in the data chain, generally in
collections, rather than scattering defensive defaults through renderers.
`nullish-coalescing.test.js`, `data-fallbacks.test.js`, and
`try-catch-usage.test.js` enforce related policies with distinct scopes; the
generic FP library is not the site-data chain. External input and browser storage
may need boundary validation, but are not blanket exceptions to the gates.

Consult each gate's specific allowlist and
`test/code-quality/code-quality-exceptions.js`. The central exceptions file is a
deletion-only legacy baseline, not a place to approve new violations. If a check
appears wrong, demonstrate the false positive and discuss a targeted correction;
do not silently add exceptions or convert thrown failures to default values.

## Testing Workflow

Vitest configuration lives in `vitest.config.js`; shared factories and cleanup
helpers live in `test/test-utils/` and are re-exported by `#test/test-utils.js`.
Use them to exercise production behavior and isolate resources. Follow
[all mandatory test criteria](test/TEST-QUALITY-CRITERIA.md).

**Do not run `npm test` repeatedly to diagnose one issue.** Start with a file,
test name, or subsystem:

```sh
npx vitest run test/unit/utils/slug-utils.test.js
npx vitest run test/unit/utils/slug-utils.test.js -t "specific test name"
npx vitest run test/unit/collections/
npx vitest run test/unit/code-quality/
```

For lint, use `npm run lint` and `npm run lint:fix`, or scope the repository's
Biome runner to changed JavaScript files: `node scripts/biome.js check <paths>`.
Inspect formatter changes rather than modifying unrelated files.

When the full suite is needed, capture its output once and inspect that log
instead of rerunning it through successive filters. Keep temporary logs outside
the worktree, for example under `/tmp/opencode/`.

Mutation testing checks whether tests detect changes to production operators:

```sh
npm run mutation -- src/_lib/utils/slug-utils.js test/unit/utils/slug-utils.test.js
npm run mutation -- 'src/_lib/eleventy/*.js' 'test/unit/eleventy/*.test.js' --exhaustive
```

Investigate survivors; a survivor is not automatically a missing test or an
equivalent change. Proven-equivalent mutants (no input can distinguish them)
belong in `scripts/mutation/equivalent-mutants.txt`, whose entries are validated
by the mutation tooling. This is separate from the deletion-only code-quality
baseline. Never weaken production mutation/style gates to satisfy mutation tests.

## Generated Artifacts

Edit sources, never generated output by hand. After block schema changes:

1. Update `src/_lib/utils/block-schema/<type>.js` and register new modules in `src/_lib/utils/block-schema.js`.
2. Add/update `src/_includes/design-system/blocks/<type>.html` and the matching SCSS partial under `src/css/design-system/`; forward new partials from its index.
3. Run `npm run generate-references`. Its three steps generate the block reference, PagesCMS config plus CMS types, and Site Builder Reference in order, stopping on failure. Review all four artifacts: `skills/cfa-static-site-builder/references/blocks.md`, `.pages.yml`, `src/_lib/types/pages-cms-generated.d.ts`, and `docs/developer-reference.md`. Precommit checks freshness without regenerating; regenerate and re-stage stale artifacts before retrying.

The block reference is wholly generated. `BLOCKS_LAYOUT.md` is a handwritten
navigation page; the skill's `SKILL.md`, layout guidance, and other workflow
references remain handwritten. Edit those directly when procedures change.

`docs/developer-reference.md` is wholly owned by
`scripts/generate-developer-reference.js`. Regenerate it with
`npm run generate-references` (or `npm run generate-developer-reference` for this file alone)
after changing its `package.json` or shared CMS definition module inputs. Its freshness test
compares in memory without rewriting the committed file. Keep policy here and
test criteria in their canonical handwritten document, not in generated facts.
