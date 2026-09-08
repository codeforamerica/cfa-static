/** Generate docs/developer-reference.md. Policy belongs in CLAUDE.md. */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseSync } from "oxc-parser";
import scss from "postcss-scss";
import YAML from "yaml";
import { ROOT_DIR } from "#lib/paths.js";
import { runIfMain } from "#scripts/lib/is-main-module.js";
import { pick } from "#utils/fp/array.js";

/** @typedef {{ path: string, content: string }} SourceFile */
/** @typedef {SourceFile & { constant: string }} DefinitionSource */
/** @typedef {{ engines: { node: string }, scripts: Record<string, string>, imports: Record<string, unknown> }} PackageInfo */

// HTML code cells preserve shell backticks and pipes without breaking tables.
/** @param {unknown} value */
const code = (value) =>
  `<code>${String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replace(/[\\`*_[\]~]/g, (char) => `&#${char.charCodeAt(0)};`)
    .replaceAll("|", "&#124;")
    .replaceAll("\n", "<br>")}</code>`;

/** @param {string[]} headers @param {string[][]} rows */
const table = (headers, rows) =>
  [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");

/** @param {unknown} value */
const jsonBlock = (value) =>
  `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
/** @param {string} path */
const sourceLink = (path) => `[${path}](../${path})`;

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
        summary ? code(summary) : "No adjacent JSDoc summary; see source.",
      ];
    });
  return `### \`#utils/fp/${path.split("/").at(-1)}\`\n\n${sourceLink(path)}\n\n${table(["Export", "JSDoc Summary"], rows)}`;
};

/** @param {ReturnType<typeof scss.parse>["nodes"]} nodes @param {string} prefix */
const declarationRows = (nodes, prefix) =>
  nodes
    .filter((node) => node.type === "decl")
    .filter((node) => node.prop.startsWith(prefix))
    .map((node) => [
      code(node.prop),
      code(`${node.value}${node.important ? " !important" : ""}`),
    ]);

/** Literal top-level :root declarations only; no Sass evaluation or cascade inference.
 * @param {SourceFile} file
 */
const renderTheme = ({ path, content }) => {
  const roots = scss
    .parse(content, { from: path })
    .nodes.filter((node) => node.type === "rule")
    .filter((node) => node.selector === ":root");
  if (!roots.length) return [];
  const rows = declarationRows(
    roots.flatMap((root) => root.nodes),
    "--",
  );
  return [
    `### ${sourceLink(path)}\n\n${table(["Token", "Source Value"], rows)}`,
  ];
};

/** @param {SourceFile} file */
const renderSass = ({ path, content }) => {
  const { nodes } = scss.parse(content, { from: path });
  const rows = declarationRows(nodes, "$");
  const helpers = nodes
    .filter((node) => node.type === "atrule")
    .filter((node) => ["function", "mixin"].includes(node.name))
    .map((node) => `\`\`\`scss\n${node.toString()}\n\`\`\``);
  return [
    `### ${sourceLink(path)}`,
    table(["Sass Variable", "Source Expression"], rows),
    ...helpers,
  ].join("\n\n");
};

/** Extract one known top-level array declaration without importing its module.
 * @param {DefinitionSource} file
 */
const renderCmsDefinition = ({ path, content, constant }) => {
  const { program } = parseReferenceJavaScript(path, content);
  const declaration = program.body
    .map((node) =>
      node.type === "ExportNamedDeclaration" ? node.declaration : node,
    )
    .filter((node) => node?.type === "VariableDeclaration")
    .flatMap((node) => node.declarations)
    .find(({ id }) => id.type === "Identifier" && id.name === constant);
  if (declaration?.init?.type !== "ArrayExpression") {
    throw new Error(`Expected top-level array ${constant} in ${path}`);
  }
  const source = content.slice(declaration.init.start, declaration.init.end);
  return `### ${constant}\n\nSource: ${sourceLink(path)}.\n\n\`\`\`js\nconst ${constant} = ${source};\n\`\`\``;
};

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
  return `### ${sourceLink(path)}\n\n\`\`\`yaml\n${YAML.stringify(facts, { lineWidth: 0 })}\`\`\``;
};

/** @param {{ sassSources: SourceFile[], cmsSources: DefinitionSource[], workflowSources: SourceFile[] }} inputs */
const renderStructuredSources = ({
  sassSources,
  cmsSources,
  workflowSources,
}) =>
  [
    "## Sass Source Declarations",
    "Top-level Sass variable declarations from `src/css/_variables.scss` and `src/css/_breakpoints.scss`, plus their function/mixin definitions. Values are source expressions, not evaluated CSS: `!default` is a Sass configuration flag, references and arithmetic remain unevaluated, and the breakpoint map is not a table of computed media-query thresholds. Nested helper variables are only shown inside their definitions. No equivalence between separately declared breakpoint values is inferred.",
    ...sassSources.map(renderSass),
    "## CMS Definitions",
    "The `COLLECTIONS` and `FEATURE_QUESTIONS` arrays are extracted from their definition modules without importing or executing them. Collection paths and direct dependencies are declared values, not resolved site paths or transitive dependencies. Optional flags are shown only when present. Feature questions identify available choices, not saved selections or inferred defaults. This is not the generated PagesCMS field schema or an inventory of runtime/custom collections.",
    ...cmsSources.map(renderCmsDefinition),
    "## Deployment Workflow Facts",
    "Parsed configured workflow metadata and job definitions from the linked YAML files. Job facts include declared runners, dependencies, conditions, strategy, environments, defaults, reusable-workflow inputs, and complete ordered steps (including build commands and step env/with mappings). YAML formatting and comments are normalized. Omitted keys stay omitted: no runner, shell, environment, or application defaults are inferred. GitHub expressions are literal source expressions; no environment variables or secret values are read or evaluated.",
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
 * @param {{ packageJson: PackageInfo, biome: Record<string, unknown>, fpSources: SourceFile[], themeSources: SourceFile[], sassSources: SourceFile[], cmsSources: DefinitionSource[], workflowSources: SourceFile[] }} inputs
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
    "Source-file catalog: `src/css/theme.scss` and `src/css/theme-*.scss` files that contain a top-level `:root` rule. Files without that rule (such as editor styles) are omitted. Tables preserve literal custom-property declarations in source order. This is not the compiled theme-switcher registry, a complete design-system token inventory, computed CSS, or a claim about scoped overrides and Sass defaults. Follow the source links for the rest of each theme.",
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

/** Read source inputs only. Importing this module does not read or write files. */
export const readDeveloperReferenceInputs = () => ({
  packageJson: JSON.parse(readReferenceSource("package.json").content),
  biome: JSON.parse(readReferenceSource("biome.json").content),
  fpSources: sources("src/_lib/utils/fp", /\.js$/),
  themeSources: sources("src/css", /^theme(?:-.+)?\.scss$/),
  sassSources: ["src/css/_variables.scss", "src/css/_breakpoints.scss"].map(
    readReferenceSource,
  ),
  cmsSources: [
    { path: "scripts/customise-cms/collections.js", constant: "COLLECTIONS" },
    { path: "scripts/customise-cms/prompts.js", constant: "FEATURE_QUESTIONS" },
  ].map(({ path, constant }) => ({ ...readReferenceSource(path), constant })),
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
