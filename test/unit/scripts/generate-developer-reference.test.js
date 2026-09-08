import MarkdownIt from "markdown-it";
import { describe, expect, test } from "vitest";
import YAML from "yaml";
import { renderDeveloperReference } from "#scripts/generate-developer-reference.js";

const inputs = (overrides = {}) => ({
  packageJson: {
    engines: { node: ">=99" },
    scripts: { inspect: "node inspect.js --strict", test: "vitest run" },
    imports: { "#fixture/*": "./fixtures/*" },
  },
  biome: {
    files: { includes: ["src/**/*.js", "!src/vendor"] },
    formatter: { indentWidth: 4 },
    linter: {
      rules: {
        complexity: {
          noExcessiveCognitiveComplexity: {
            level: "warn",
            options: { maxAllowedComplexity: 3 },
          },
        },
      },
    },
    overrides: [{ includes: ["test/**"], linter: { enabled: false } }],
  },
  fpSources: [],
  themeSources: [],
  sassSources: [],
  cmsSources: [],
  workflowSources: [],
  ...overrides,
});

const fpInput = (content) =>
  inputs({ fpSources: [{ path: "src/_lib/utils/fp/example.js", content }] });

const documentedWorkflow = (content) => {
  const output = renderDeveloperReference(
    inputs({
      workflowSources: [{ path: "workflow.yml", content }],
    }),
  );
  const [match] = output.matchAll(/```yaml\n([\s\S]*?)```/g);
  return YAML.parse(match[1]);
};

describe("developer reference rendering", () => {
  test("renders the supplied Node requirement", () => {
    expect(renderDeveloperReference(inputs())).toContain(
      "Node requirement: <code>&gt;=99</code>",
    );
  });

  test("lists every script with its exact command", () => {
    expect(renderDeveloperReference(inputs())).toContain(
      "| <code>npm run inspect</code> | <code>node inspect.js --strict</code> |\n" +
        "| <code>npm run test</code> | <code>vitest run</code> |",
    );
  });

  test("preserves literal shell syntax in rendered Markdown table cells", () => {
    const fixture = inputs();
    const command =
      "a | b && c <in >out `cmd` '**/a/**,**/b/**' __literal__ [link](url) \\*";
    const output = renderDeveloperReference({
      ...fixture,
      packageJson: {
        ...fixture.packageJson,
        scripts: { shell: command },
      },
    });
    const doc = new DOMParser().parseFromString(
      new MarkdownIt({ html: true }).render(output),
      "text/html",
    );
    const cell = doc.querySelector("tbody tr td:nth-child(2)");
    expect(cell.textContent).toBe(command);
    expect(cell.querySelectorAll("strong, em, a")).toHaveLength(0);
  });

  test("renders command line breaks without ending the table row", () => {
    const fixture = inputs();
    const output = renderDeveloperReference({
      ...fixture,
      packageJson: {
        ...fixture.packageJson,
        scripts: { shell: "first\nsecond" },
      },
    });
    expect(output).toContain("<code>first<br>second</code>");
  });

  test("renders alias targets including conditional mappings", () => {
    const fixture = inputs();
    const output = renderDeveloperReference({
      ...fixture,
      packageJson: {
        ...fixture.packageJson,
        imports: {
          ...fixture.packageJson.imports,
          "#conditional": { node: "./node.js", default: "./web.js" },
        },
      },
    });
    expect(output).toContain(
      "| <code>#fixture/&#42;</code> | <code>./fixtures/&#42;</code> |",
    );
    expect(output).toContain(
      '<code>{"node":"./node.js","default":"./web.js"}</code>',
    );
  });

  test.each([
    "files",
    "formatter",
    "linter",
    "overrides",
  ])("preserves the configured Biome %s rather than hardcoding limits", (key) => {
    const fixture = inputs();
    const blocks = Array.from(
      renderDeveloperReference(fixture).matchAll(/```json\n([\s\S]*?)\n```/g),
      (match) => JSON.parse(match[1]),
    );
    const rendered = { ...blocks[0], linter: blocks[1], overrides: blocks[2] };
    expect(rendered[key]).toEqual(fixture.biome[key]);
  });

  test("indexes real named exports without executing source", () => {
    const output = renderDeveloperReference(
      fpInput(`
      throw new Error("must not execute");
      const privateHelper = () => 1;
      /** Public summary. */
      const local = () => privateHelper();
      export { local as publicName };
      /** Direct summary. */
      export const direct = () => 2;
      /** Function summary. */
      export function callable() { return 3; }
    `),
    );
    expect(output).toContain("<code>publicName</code>");
    expect(output).toContain("<code>direct</code>");
    expect(output).toContain("<code>callable</code>");
    expect(output).not.toContain("<code>privateHelper</code>");
    expect(output).not.toContain("<code>local</code>");
  });

  test("links JSDoc summaries to their declaration line", () => {
    const output = renderDeveloperReference(
      fpInput(
        "/** First line\n * continues here.\n * @param {string} value\n */\nexport const named = value => value;",
      ),
    );
    expect(output).toContain(
      "[<code>named</code>](../src/_lib/utils/fp/example.js#L5) | <code>First line continues here.</code>",
    );
    expect(output).not.toContain("@param");
  });

  test("stops JSDoc summaries at paragraph boundaries", () => {
    const output = renderDeveloperReference(
      fpInput(
        "/** Summary.\n *\n * Details deliberately omitted.\n */\nexport const named = 1;",
      ),
    );
    expect(output).toContain("<code>Summary.</code>");
    expect(output).not.toContain("Details deliberately omitted.");
  });

  test.each([
    "export const undocumented = 1;",
    "// Not JSDoc\nexport const undocumented = 1;",
    "/** @param {string} value */\nexport const undocumented = value => value;",
    "/** Unrelated summary. */\nconst hidden = 1;\nexport const undocumented = hidden;",
  ])("marks missing adjacent prose explicitly: %s", (source) => {
    expect(renderDeveloperReference(fpInput(source))).toContain(
      "No adjacent JSDoc summary; see source.",
    );
  });

  test("rejects invalid JavaScript with the source path", () => {
    expect(() => renderDeveloperReference(fpInput("export const = ;"))).toThrow(
      "Cannot parse src/_lib/utils/fp/example.js",
    );
  });

  test.each([
    'export { named } from "elsewhere";',
    'export * from "elsewhere";',
    "export default () => 1;",
    "export default function () { return 1; }",
    "export const { named } = { named: 1 };",
  ])("rejects unsupported export forms rather than omitting them: %s", (source) => {
    expect(() => renderDeveloperReference(fpInput(source))).toThrow(
      "Unsupported FP export in src/_lib/utils/fp/example.js",
    );
  });

  test("catalogs only literal top-level root tokens", () => {
    const output = renderDeveloperReference(
      inputs({
        themeSources: [
          {
            path: "src/css/theme-sample.scss",
            content: `// --commented: no;
            :root { --color: rgb(1 2 3 / 5%); --font: "A; B"; color: red; }
            button { --scoped: blue; }
            @media (width > 10px) { :root { --nested: ignored; } }`,
          },
          {
            path: "src/css/theme-editor.scss",
            content: ".editor { color: red; }",
          },
        ],
      }),
    );
    expect(output).toContain(
      "[src/css/theme-sample.scss](../src/css/theme-sample.scss)",
    );
    expect(output).toContain(
      "| <code>--color</code> | <code>rgb(1 2 3 / 5%)</code> |",
    );
    expect(output).toContain('| <code>--font</code> | <code>"A; B"</code> |');
    expect(output).not.toMatch(
      /--commented|--scoped|--nested|theme-editor\.scss/,
    );
  });

  test("rejects malformed theme source", () => {
    expect(() =>
      renderDeveloperReference(
        inputs({
          themeSources: [
            { path: "src/css/theme-broken.scss", content: ":root {" },
          ],
        }),
      ),
    ).toThrow("Unclosed block");
  });

  test("preserves important flags on source token declarations", () => {
    const output = renderDeveloperReference(
      inputs({
        themeSources: [
          {
            path: "src/css/theme-important.scss",
            content: ":root { --color: red !important; }",
          },
        ],
      }),
    );
    expect(output).toContain(
      "| <code>--color</code> | <code>red !important</code> |",
    );
  });

  test("sorts source catalogs without mutating caller input", () => {
    const fpSources = Object.freeze([
      { path: "src/_lib/utils/fp/z.js", content: "export const z = 1;" },
      { path: "src/_lib/utils/fp/a.js", content: "export const a = 1;" },
    ]);
    const themeSources = Object.freeze([
      { path: "src/css/theme-z.scss", content: ":root { --z: 1; }" },
      { path: "src/css/theme-a.scss", content: ":root { --a: 1; }" },
    ]);
    const output = renderDeveloperReference(
      inputs({ fpSources, themeSources }),
    );
    expect(output.indexOf("#utils/fp/a.js")).toBeLessThan(
      output.indexOf("#utils/fp/z.js"),
    );
    expect(output.indexOf("src/css/theme-a.scss")).toBeLessThan(
      output.indexOf("src/css/theme-z.scss"),
    );
  });

  test("preserves Sass references, arithmetic, maps, and default flags without evaluation", () => {
    const output = renderDeveloperReference(
      inputs({
        sassSources: [
          {
            path: "src/css/_variables.scss",
            content: `// $commented: 1px;
        $unit: 9px !default;
        $width: $unit * 7 !default;
        $breakpoints: ("small": 701px, "large": 999px);
        .scope { $nested: 5px; }
        @function alias($name) { @return unquote("var(--#{$name})"); }`,
          },
        ],
      }),
    );
    expect(output).toContain(
      "| <code>$unit</code> | <code>9px !default</code> |",
    );
    expect(output).toContain(
      "| <code>$width</code> | <code>$unit &#42; 7 !default</code> |",
    );
    expect(output).toContain('<code>("small": 701px, "large": 999px)</code>');
    expect(output).toContain(
      '@function alias($name) { @return unquote("var(--#{$name})"); }',
    );
    expect(output).not.toMatch(/63px|\$commented|\$nested/);
  });

  test("includes breakpoint mixin definitions instead of inventing evaluated thresholds", () => {
    const content = `@mixin up($name) {
  $value: map.get($breakpoints, $name);
  @media (min-width: $value + 2) { @content; }
}`;
    const output = renderDeveloperReference(
      inputs({
        sassSources: [
          {
            path: "src/css/_breakpoints.scss",
            content,
          },
        ],
      }),
    );
    expect(output).toContain(`\`\`\`scss\n${content}\n\`\`\``);
  });

  test.each([
    "COLLECTIONS",
    "FEATURE_QUESTIONS",
  ])("extracts only the requested CMS definition %s without importing runtime modules", (constant) => {
    const definition =
      '[{ name: "guides", path: "content/guides", dependencies: ["categories"], required: false }]';
    const output = renderDeveloperReference(
      inputs({
        cmsSources: [
          {
            path: "scripts/customise-cms/example.js",
            constant,
            content: `import config from "does-not-exist";\nthrow new Error("must not execute");\nconst unrelated = ["omit-me"];\nexport const ${constant} = ${definition};`,
          },
        ],
      }),
    );
    expect(output).toContain(`const ${constant} = ${definition};`);
    expect(output).not.toMatch(/does-not-exist|omit-me|internal:/);
  });

  test("preserves feature choice labels in declaration order", () => {
    const definition = `[
  ["z_choice", "First question?"],
  ["a_choice", "Second question?"],
]`;
    const output = renderDeveloperReference(
      inputs({
        cmsSources: [
          {
            path: "scripts/customise-cms/prompts.js",
            constant: "FEATURE_QUESTIONS",
            content: `const FEATURE_QUESTIONS = ${definition};`,
          },
        ],
      }),
    );
    expect(output).toContain(`const FEATURE_QUESTIONS = ${definition};`);
  });

  test.each([
    "const OTHER = [];",
    "const COLLECTIONS = getCollections();",
  ])("fails when the requested CMS array is unavailable: %s", (content) => {
    expect(() =>
      renderDeveloperReference(
        inputs({
          cmsSources: [
            {
              path: "definitions.js",
              constant: "COLLECTIONS",
              content,
            },
          ],
        }),
      ),
    ).toThrow("Expected top-level array COLLECTIONS in definitions.js");
  });

  test("reports invalid CMS source at its path", () => {
    expect(() =>
      renderDeveloperReference(
        inputs({
          cmsSources: [
            {
              path: "definitions.js",
              constant: "COLLECTIONS",
              content: "const = ;",
            },
          ],
        }),
      ),
    ).toThrow("Cannot parse definitions.js");
  });

  test("preserves configured workflow runner, build, environment, and expression values", () => {
    const workflow = {
      name: "Fixture deployment",
      on: { workflow_dispatch: null },
      env: { TOP_LEVEL: "literal" },
      permissions: { contents: "read" },
      concurrency: { group: "fixture", "cancel-in-progress": false },
      jobs: {
        build: {
          "runs-on": "${{ matrix.runner }}",
          strategy: { matrix: { runner: ["custom-runner"] } },
          environment: "preview",
          env: { JOB_LEVEL: "configured" },
          defaults: { run: { shell: "bash", "working-directory": "app" } },
          steps: [
            {
              uses: "actions/setup-node@some-ref",
              with: { "node-version": 99 },
            },
            {
              run: "npm ci\nnpm run special-build\n",
              env: {
                SITE_URL: "${{ vars.SITE_URL }}",
                TOKEN: "${{ secrets.DEPLOY_TOKEN }}",
              },
            },
          ],
        },
      },
    };
    expect(documentedWorkflow(YAML.stringify(workflow))).toEqual(workflow);
  });

  test("does not infer undeclared workflow keys", () => {
    expect(
      documentedWorkflow(
        "jobs:\n  deploy:\n    runs-on: fixture\n    steps:\n      - run: npm run build\n",
      ),
    ).toEqual({
      jobs: {
        deploy: {
          "runs-on": "fixture",
          steps: [{ run: "npm run build" }],
        },
      },
    });
  });

  test.each([
    "name: missing jobs",
    "jobs: []",
    "jobs: invalid",
    "jobs: null",
  ])("rejects a workflow without a jobs mapping: %s", (content) => {
    expect(() => documentedWorkflow(content)).toThrow(
      "Expected workflow jobs mapping in workflow.yml",
    );
  });

  test("rejects ambiguous duplicate workflow keys", () => {
    expect(() => documentedWorkflow("jobs: {}\njobs: {}")).toThrow(
      "Map keys must be unique",
    );
  });
});
