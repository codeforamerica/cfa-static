import { join } from "node:path";
import { pathToFileURL } from "node:url";
import MarkdownIt from "markdown-it";
import { describe, expect, test } from "vitest";
import YAML from "yaml";
import { COLLECTIONS } from "#scripts/customise-cms/collections.js";
import { FEATURE_QUESTIONS } from "#scripts/customise-cms/feature-questions.js";
import {
  readDeveloperReferenceInputs,
  renderDeveloperReference,
} from "#scripts/generate-developer-reference.js";
import { getFiles, rootDir } from "#test/test-utils.js";

const markdown = new MarkdownIt({ html: true });
const codeBlocks = (output, language) =>
  markdown
    .parse(output, {})
    .filter((token) => token.type === "fence" && token.info === language)
    .map((token) => token.content);

const cmsRuntimeDefinitions = [
  ["COLLECTIONS", COLLECTIONS],
  ["FEATURE_QUESTIONS", FEATURE_QUESTIONS],
];

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
  cmsDefinitions: [],
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
  return YAML.parse(codeBlocks(output, "yaml")[0]);
};

describe("developer reference rendering", () => {
  test.each([
    ["fpSources", /^src\/_lib\/utils\/fp\/[^/]+\.js$/],
    ["themeSources", /^src\/css\/theme(?:-[^/]+)?\.scss$/],
  ])("discovers the complete %s source catalog", (key, pattern) => {
    const expected = getFiles(pattern).toSorted();
    expect(expected.length).toBeGreaterThan(0);
    expect(
      readDeveloperReferenceInputs()
        [key].map(({ path }) => path)
        .toSorted(),
    ).toEqual(expected);
  });

  test("documented FP exports exactly match the runtime APIs", async () => {
    const files = getFiles(/^src\/_lib\/utils\/fp\/[^/]+\.js$/);
    const expected = (
      await Promise.all(
        files.map(async (file) => {
          const module = await import(pathToFileURL(join(rootDir, file)).href);
          return Object.keys(module).map((name) => `${file}:${name}`);
        }),
      )
    )
      .flat()
      .toSorted();
    const document = new DOMParser().parseFromString(
      markdown.render(renderDeveloperReference(readDeveloperReferenceInputs())),
      "text/html",
    );
    const actual = [
      ...document.querySelectorAll(
        'a[href^="../src/_lib/utils/fp/"][href*="#L"]',
      ),
    ]
      .map(
        (link) =>
          `${link
            .getAttribute("href")
            .slice(3)
            .replace(/#L\d+$/, "")}:${link.textContent}`,
      )
      .toSorted();
    expect(actual).toEqual(expected);
  });

  test("renders the supplied Node requirement", () => {
    expect(renderDeveloperReference(inputs())).toContain(
      "Node requirement: <code>&gt;&#61;99</code>",
    );
  });

  test("lists every script with its exact command", () => {
    expect(renderDeveloperReference(inputs())).toContain(
      "| <code>npm run inspect</code> | <code>node inspect&#46;js &#45;&#45;strict</code> |\n" +
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
      "| <code>&#35;fixture/&#42;</code> | <code>&#46;/fixtures/&#42;</code> |",
    );
    expect(output).toContain(
      '<code>{"node":"&#46;/node&#46;js","default":"&#46;/web&#46;js"}</code>',
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
      "[<code>named</code>](../src/_lib/utils/fp/example.js#L5) | <code>First line continues here&#46;</code>",
    );
    expect(output).not.toContain("@param");
  });

  test("stops JSDoc summaries at paragraph boundaries", () => {
    const output = renderDeveloperReference(
      fpInput(
        "/** Summary.\n *\n * Details deliberately omitted.\n */\nexport const named = 1;",
      ),
    );
    expect(output).toContain("<code>Summary&#46;</code>");
    expect(output).not.toContain("Details deliberately omitted");
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
      "[src/css/theme&#45;sample&#46;scss](../src/css/theme-sample.scss)",
    );
    expect(output).toContain(
      "| <code>&#45;&#45;color</code> | <code>rgb(1 2 3 / 5%&#41;</code> |",
    );
    expect(output).toContain(
      '| <code>&#45;&#45;font</code> | <code>"A; B"</code> |',
    );
    expect(output).not.toMatch(
      /&#45;&#45;(?:commented|scoped|nested)|theme-editor\.scss/,
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
      "| <code>&#45;&#45;color</code> | <code>red &#33;important</code> |",
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
    expect(output.indexOf("src/_lib/utils/fp/a.js")).toBeLessThan(
      output.indexOf("src/_lib/utils/fp/z.js"),
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
      "| <code>$unit</code> | <code>9px &#33;default</code> |",
    );
    expect(output).toContain(
      "| <code>$width</code> | <code>$unit &#42; 7 &#33;default</code> |",
    );
    expect(output).toContain(
      '<code>("small": 701px, "large": 999px&#41;</code>',
    );
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

  test.each(
    cmsRuntimeDefinitions,
  )("discovers %s from its actual runtime source", async (constant, value) => {
    const definition = readDeveloperReferenceInputs().cmsDefinitions.find(
      (entry) => entry.constant === constant,
    );
    expect(definition.value).toBe(value);
    const module = await import(
      pathToFileURL(join(rootDir, definition.path)).href
    );
    expect(module[constant]).toBe(value);
  });

  test.each(
    cmsRuntimeDefinitions,
  )("documents the same %s values used by the CMS runtime", (_constant, value) => {
    const output = renderDeveloperReference(readDeveloperReferenceInputs());
    const definitions = codeBlocks(output, "json").map((content) =>
      JSON.parse(content),
    );
    expect(definitions).toContainEqual(value);
  });

  test.each([
    [
      "COLLECTIONS",
      [
        {
          ...COLLECTIONS[0],
          name: "guides",
          path: "content/guides",
          required: false,
          dependencies: [],
        },
      ],
    ],
    [
      "FEATURE_QUESTIONS",
      [
        ["no_index", "First question?\n```\n````\n<script>"],
        ["faqs", "Second question?"],
      ],
    ],
  ])("serializes supplied %s data without inserting defaults or changing order", (constant, value) => {
    const output = renderDeveloperReference(
      inputs({
        cmsDefinitions: [{ path: "fixture.js", constant, value }],
      }),
    );
    expect(JSON.parse(codeBlocks(output, "json").at(-1))).toEqual(value);
    expect(output).toContain("(../fixture.js)");
  });

  test("preserves Sass source with fence collisions as one complete fenced block", () => {
    const source = {
      path: "helpers.scss",
      content: "@mixin sample {\n/*\n```\n````\n*/\n@content;\n}",
    };
    const output = renderDeveloperReference(inputs({ sassSources: [source] }));
    const fences = codeBlocks(output, "scss");
    expect(fences).toHaveLength(1);
    expect(fences[0]).toBe(`${source.content}\n`);
  });

  test("preserves workflow commands containing fence collisions", () => {
    const workflow = {
      jobs: { build: { steps: [{ run: "```\n````\nend" }] } },
    };
    const output = renderDeveloperReference(
      inputs({
        workflowSources: [
          { path: "workflow.yml", content: YAML.stringify(workflow) },
        ],
      }),
    );
    const fences = codeBlocks(output, "yaml");
    expect(fences).toHaveLength(1);
    expect(YAML.parse(fences[0])).toEqual(workflow);
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
