/** Generate docs/developer-reference.md. Policy belongs in CLAUDE.md. */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseSync } from "oxc-parser";
import scss from "postcss-scss";
import YAML from "yaml";
import { ROOT_DIR } from "#lib/paths.js";
import { COLLECTIONS } from "#scripts/customise-cms/collections.js";
import { FEATURE_QUESTIONS } from "#scripts/customise-cms/feature-questions.js";
import { runIfMain } from "#scripts/lib/is-main-module.js";
import {
  inlineCode as code,
  escapeText,
  fencedCode,
  markdownTable as table,
} from "#scripts/lib/markdown.js";
import { pick } from "#utils/fp/array.js";

/** @typedef {{ path: string, content: string }} SourceFile */
/** @typedef {{ path: string } & ({ constant: "COLLECTIONS", value: typeof COLLECTIONS } | { constant: "FEATURE_QUESTIONS", value: typeof FEATURE_QUESTIONS })} CmsDefinition */
/** @typedef {{ engines: { node: string }, scripts: Record<string, string>, imports: Record<string, unknown> }} PackageInfo */

/** @param {unknown} value */
const jsonBlock = (value) => fencedCode(JSON.stringify(value, null, 2), "json");
/** @param {string} path */
const sourceLink = (path) => `[${code(path)}](../${path})`;

/** @param {string} path @param {string} content */
const parseReferenceJavaScript = (path, content) => {
  const parsed = parseSync(path, content);
  if (parsed.errors.length)
    throw new Error(`Cannot parse ${path}: ${parsed.errors[0].message}`);
  return parsed;
};

/** @param {import("oxc-parser").Program["body"][number]} statement */
const declarations = (statement) => {
  const node =
    "declaration" in statement && statement.declaration
      ? statement.declaration
      : statement;
  if (node.type === "VariableDeclaration") {
    return node.declarations.flatMap(({ id }) =>
      id.type === "Identifier"
        ? [{ name: id.name, start: statement.start }]
        : [],
    );
  }
  return node.type === "FunctionDeclaration" && node.id
    ? [{ name: node.id.name, start: statement.start }]
    : [];
};

/** @param {string} source @param {import("oxc-parser").Comment[]} comments @param {number} start */
const adjacentSummary = (source, comments, start) => {
  const comment = comments.findLast(
    (item) => item.end <= start && !source.slice(item.end, start).trim(),
  );
  if (comment?.type !== "Block" || !comment.value.startsWith("*")) return "";
  return comment.value
    .replace(/^\s*\* ?/gm, "")
    .trim()
    .split(/\n\s*\n|(?:^|\n)\s*@/)[0]
    .replaceAll("\n", " ")
    .trim();
};

/** Extract only local named exports and immediately preceding JSDoc prose.
 * Unsupported export forms fail rather than silently dropping public APIs.
 * @param {SourceFile} file
 */
const renderFpModule = ({ path, content }) => {
  const { program, module, comments } = parseReferenceJavaScript(path, content);
  const locals = new Map(
    program.body.flatMap(declarations).map((local) => [local.name, local]),
  );
  const rows = module.staticExports
    .flatMap(({ entries }) => entries)
    .map((entry) => {
      const local = entry.localName.name && locals.get(entry.localName.name);
      if (entry.moduleRequest || entry.exportName.kind !== "Name" || !local) {
        throw new Error(
          `Unsupported FP export in ${path}: ${entry.exportName.name}`,
        );
      }
      const summary = adjacentSummary(content, comments, local.start);
      const line = content.slice(0, local.start).split("\n").length;
      return [
        `[${code(entry.exportName.name)}](../${path}#L${line})`,
        summary
          ? escapeText(summary)
          : "No adjacent JSDoc summary; see source.",
      ];
    });
  return `### ${code(`#utils/fp/${path.split("/").at(-1)}`)}\n\n${sourceLink(path)}\n\n${table(["Export", "JSDoc Summary"], rows)}`;
};

/** @param {ReturnType<typeof scss.parse>["nodes"]} nodes @param {string} prefix */
const renderDeclarations = (nodes, prefix) => {
  const declarations = nodes
    .filter((node) => node.type === "decl")
    .filter((node) => node.prop.startsWith(prefix))
    .map(
      (node) =>
        `${node.prop}: ${node.value}${node.important ? " !important" : ""};`,
    )
    .join("\n");
  return declarations ? [fencedCode(declarations, "scss")] : [];
};

/** Literal top-level :root declarations only; no Sass evaluation or cascade inference.
 * @param {SourceFile} file
 */
const renderTheme = ({ path, content }) => {
  const roots = scss
    .parse(content, { from: path })
    .nodes.filter((node) => node.type === "rule")
    .filter((node) => node.selector === ":root");
  if (!roots.length) return [];
  return [
    [
      `### ${sourceLink(path)}`,
      ...renderDeclarations(
        roots.flatMap((root) => root.nodes),
        "--",
      ),
    ].join("\n\n"),
  ];
};

/** @param {SourceFile} file */
const renderSass = ({ path, content }) => {
  const { nodes } = scss.parse(content, { from: path });
  const helpers = nodes
    .filter((node) => node.type === "atrule")
    .filter((node) => ["function", "mixin"].includes(node.name))
    .map((node) => fencedCode(node.toString(), "scss"));
  return [
    `### ${sourceLink(path)}`,
    ...renderDeclarations(nodes, "$"),
    ...helpers,
  ].join("\n\n");
};

/** @param {CmsDefinition} definition */
const renderCmsDefinition = ({ path, value, constant }) =>
  `### ${escapeText(constant)}\n\nSource: ${sourceLink(path)}.\n\n${jsonBlock(value)}`;

/** @param {SourceFile} file */
const renderWorkflow = ({ path, content }) => {
  const workflow = YAML.parse(content);
  if (
    !workflow?.jobs ||
    typeof workflow.jobs !== "object" ||
    Array.isArray(workflow.jobs)
  ) {
    throw new Error(`Expected workflow jobs mapping in ${path}`);
  }
  const facts = {
    ...pick(["name", "on", "permissions", "concurrency", "env", "defaults"])(
      workflow,
    ),
    jobs: Object.fromEntries(
      Object.entries(workflow.jobs).map(([name, job]) => [
        name,
        pick([
          "name",
          "runs-on",
          "needs",
          "if",
          "strategy",
          "environment",
          "outputs",
          "env",
          "defaults",
          "uses",
          "with",
          "secrets",
          "steps",
        ])(job),
      ]),
    ),
  };
  return `### ${sourceLink(path)}\n\n${fencedCode(YAML.stringify(facts, { lineWidth: 0 }), "yaml")}`;
};

/** @param {{ sassSources: SourceFile[], cmsDefinitions: CmsDefinition[], workflowSources: SourceFile[] }} inputs */
const renderStructuredSources = ({
  sassSources,
  cmsDefinitions,
  workflowSources,
}) =>
  [
    "## Sass Source Declarations",
    "Top-level Sass variable declarations from `src/css/_variables.scss` and `src/css/_breakpoints.scss`, plus their function/mixin definitions. Values are source expressions, not evaluated CSS: `!default` is a Sass configuration flag, references and arithmetic remain unevaluated, and the breakpoint map is not a table of computed media-query thresholds. Nested helper variables are only shown inside their definitions. No equivalence between separately declared breakpoint values is inferred.",
    ...sassSources.map(renderSass),
    "## CMS Definitions",
    "The generator imports `COLLECTIONS` from `scripts/customise-cms/collections.js` and `FEATURE_QUESTIONS` from `scripts/customise-cms/feature-questions.js`, the same definitions used by the CMS runtime. These modules have no import-time I/O; interactive prompts and saved site configuration are not loaded. This fixed catalog is serialized as JSON in declaration order, without copying JavaScript comments or evaluating source text. Collection paths and direct dependencies are declared values, not resolved site paths or transitive dependencies. Optional flags are shown only when present. Feature questions identify available choices, not saved selections or inferred defaults. This is not the generated PagesCMS field schema or an inventory of runtime/custom collections.",
    ...cmsDefinitions.map(renderCmsDefinition),
    "## Deployment Workflow Facts",
    "Parsed configured workflow metadata and job definitions from the linked YAML files. Job facts include declared runners, dependencies, conditions, strategy, environments, outputs, defaults, reusable-workflow inputs, and complete ordered steps (including build commands and step env/with mappings). YAML formatting and comments are normalized. Omitted keys stay omitted: no runner, shell, environment, or application defaults are inferred. GitHub expressions are literal source expressions; no environment variables or secret values are read or evaluated.",
    ...workflowSources.map(renderWorkflow),
  ].join("\n\n");

/** @param {PackageInfo} packageJson */
const renderPackage = (packageJson) => {
  const { engines, scripts, imports } = packageJson;
  return [
    "## Runtime And Commands",
    `Source: ${sourceLink("package.json")}. Node requirement: ${code(engines.node)}. Package manager: npm; install with \`npm install\`.`,
    "Every declared npm script is listed below in package order. Values are the exact script definitions, not expanded lifecycle hooks or inferred descriptions. Pass extra arguments after `--`.",
    table(
      ["Invocation", "Package Script"],
      Object.entries(scripts).map(([name, command]) => [
        code(`npm run ${name}`),
        code(command),
      ]),
    ),
    "## Import Aliases",
    table(
      ["Alias", "Target"],
      Object.entries(imports).map(([alias, target]) => [
        code(alias),
        code(typeof target === "string" ? target : JSON.stringify(target)),
      ]),
    ),
  ].join("\n\n");
};

/** @param {Record<string, unknown>} biome */
const renderBiome = (biome) =>
  [
    "## Biome Configuration",
    `Source: ${sourceLink("biome.json")}. These are the actual configured values, not a complete list of Biome defaults or an inferred effective rule set. Overrides retain their source order and include patterns. Separate code-quality tests have their own scopes; consult the root guide and the failing gate.`,
    "### Files And Formatting",
    jsonBlock({ files: biome.files, formatter: biome.formatter }),
    "### Base Linter",
    jsonBlock(biome.linter),
    "### Overrides",
    jsonBlock(biome.overrides),
  ].join("\n\n");

/** Pure renderer: all source inputs are supplied, no files are read or written.
 * @param {{ packageJson: PackageInfo, biome: Record<string, unknown>, fpSources: SourceFile[], themeSources: SourceFile[], sassSources: SourceFile[], cmsDefinitions: CmsDefinition[], workflowSources: SourceFile[] }} inputs
 * @returns {string}
 */
export const renderDeveloperReference = ({
  packageJson,
  biome,
  fpSources,
  themeSources,
  ...structuredSources
}) => {
  /** @param {SourceFile} a @param {SourceFile} b */
  const byPath = (a, b) => a.path.localeCompare(b.path, "en");
  return `${[
    "<!-- Generated by scripts/generate-developer-reference.js. DO NOT EDIT. -->",
    "# Developer Reference",
    "This entire file is generated. Edit its sources, then run `npm run generate-references`, or `npm run generate-developer-reference` for this file alone. The freshness test compares in memory and never rewrites this file.",
    "Handwritten policy and workflow: [CLAUDE.md](../CLAUDE.md). Architecture: [library map](../src/_lib/README.md). Mandatory testing standards: [test quality criteria](../test/TEST-QUALITY-CRITERIA.md).",
    renderPackage(packageJson),
    renderBiome(biome),
    "## Functional Utility Exports",
    "Source: every `.js` file directly under `src/_lib/utils/fp/`. Names come from parsed local named exports, not a handwritten inventory. Summaries are only the immediately preceding JSDoc prose before tags or a paragraph break; missing prose is explicitly marked. Follow source links for signatures, currying, examples, and caveats. No utility behavior is inferred, and source modules are not executed.",
    ...fpSources.toSorted(byPath).map(renderFpModule),
    "## Theme Source Tokens",
    "Source-file catalog: `src/css/theme.scss` and `src/css/theme-*.scss` files that contain a top-level `:root` rule. Files without that rule (such as editor styles) are omitted. Code blocks preserve literal custom-property declarations in source order. This is not the compiled theme-switcher registry, a complete design-system token inventory, computed CSS, or a claim about scoped overrides and Sass defaults. Follow the source links for the rest of each theme.",
    ...themeSources.toSorted(byPath).flatMap(renderTheme),
    renderStructuredSources(structuredSources),
  ].join("\n\n")}\n`;
};

/** @param {string} path @returns {SourceFile} */
const readReferenceSource = (path) => ({
  path,
  content: readFileSync(join(ROOT_DIR, path), "utf8"),
});

/** @param {string} directory @param {RegExp} pattern */
const sources = (directory, pattern) =>
  readdirSync(join(ROOT_DIR, directory))
    .filter((name) => pattern.test(name))
    .map((name) => readReferenceSource(`${directory}/${name}`));

/** Read source files and supply shared CMS data. Importing this module does not read or write files.
 * @returns {Parameters<typeof renderDeveloperReference>[0]}
 */
export const readDeveloperReferenceInputs = () => ({
  packageJson: JSON.parse(readReferenceSource("package.json").content),
  biome: JSON.parse(readReferenceSource("biome.json").content),
  fpSources: sources("src/_lib/utils/fp", /\.js$/),
  themeSources: sources("src/css", /^theme(?:-.+)?\.scss$/),
  sassSources: ["src/css/_variables.scss", "src/css/_breakpoints.scss"].map(
    readReferenceSource,
  ),
  cmsDefinitions: [
    {
      path: "scripts/customise-cms/collections.js",
      constant: "COLLECTIONS",
      value: COLLECTIONS,
    },
    {
      path: "scripts/customise-cms/feature-questions.js",
      constant: "FEATURE_QUESTIONS",
      value: FEATURE_QUESTIONS,
    },
  ],
  workflowSources: [
    ".github/workflows/pages.yml",
    ".github/workflows/sharedservices-deploy.yaml",
  ].map(readReferenceSource),
});

await runIfMain(import.meta.url, () => {
  const output = renderDeveloperReference(readDeveloperReferenceInputs());
  writeFileSync(join(ROOT_DIR, "docs/developer-reference.md"), output);
  console.log("Generated docs/developer-reference.md");
});
