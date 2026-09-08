import { readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import MarkdownIt from "markdown-it";
import { describe, expect, test } from "vitest";
import YAML from "yaml";
import {
  renderBlocksReference,
  renderFieldTable,
} from "#scripts/lib/render-blocks-reference.js";
import { rootDir } from "#test/test-utils.js";
import { collectBlockReferences } from "#test/unit/utils/pages-yml-helpers.js";
import { assertColumnSafeTypes } from "#utils/block-columns.js";
import { buildGalleryBlocks } from "#utils/block-gallery.js";
import { CONTAINER_FIELDS } from "#utils/block-schema/shared.js";
import {
  BLOCK_DOCS,
  BLOCK_EXAMPLES,
  BLOCK_SCHEMAS,
  collectBlockErrors,
  getBlockContainerWidth,
  getBlockTemplate,
} from "#utils/block-schema.js";

const BLOCKS_PATH = join(
  rootDir,
  "skills/cfa-static-site-builder/references/blocks.md",
);
const LAYOUTS_PATH = join(dirname(BLOCKS_PATH), "layouts.md");
const markdown = new MarkdownIt({ html: true });
const parseMarkdown = (source) =>
  new DOMParser().parseFromString(markdown.render(source), "text/html");
const tableRows = (source) =>
  [...parseMarkdown(source).querySelectorAll("tbody tr")].map((row) =>
    [...row.cells].map((cell) => cell.textContent),
  );

describe("block reference", () => {
  test("rejects missing or reordered canonical example types", () => {
    expect(() => renderBlocksReference(BLOCK_EXAMPLES.slice(1))).toThrow(
      "identical registry order",
    );
    expect(() => renderBlocksReference(BLOCK_EXAMPLES.toReversed())).toThrow(
      "identical registry order",
    );
  });

  test("rejects an entry with no canonical example", () => {
    const [first, ...rest] = BLOCK_EXAMPLES;
    expect(() =>
      renderBlocksReference([{ ...first, example: undefined }, ...rest]),
    ).toThrow(`Missing documentation or canonical example for ${first.type}`);
  });

  test("YAML examples containing Markdown fences remain a single complete code block", () => {
    const [first, ...rest] = BLOCK_EXAMPLES;
    const example = {
      ...first.example,
      intro: "```yaml\nblocks: []\n```\n````",
    };
    const tokens = markdown.parse(
      renderBlocksReference([{ ...first, example }, ...rest]),
      {},
    );
    const fences = tokens.filter((token) => token.type === "fence");
    expect(fences).toHaveLength(BLOCK_EXAMPLES.length);
    expect(YAML.parse(fences[0].content)).toEqual({ blocks: [example] });
  });

  test("committed reference matches pure rendering without rewriting it", () => {
    const committed = readFileSync(BLOCKS_PATH, "utf8");
    expect(renderBlocksReference()).toBe(committed);
  });

  test("importing the CLI does not write documentation", async () => {
    const paths = [
      BLOCKS_PATH,
      LAYOUTS_PATH,
      join(rootDir, "BLOCKS_LAYOUT.md"),
    ];
    const before = paths.map((path) => [
      readFileSync(path, "utf8"),
      statSync(path).mtimeMs,
    ]);
    await import("#scripts/generate-blocks-reference.js");
    expect(
      paths.map((path) => [readFileSync(path, "utf8"), statSync(path).mtimeMs]),
    ).toEqual(before);
  });

  test("documents every registered type once in deliberate registry order", () => {
    const headings = [
      ...parseMarkdown(renderBlocksReference()).querySelectorAll("h2 > code"),
    ].map((node) => node.textContent);
    expect(headings.length).toBeGreaterThan(0);
    expect(headings).toEqual(Object.keys(BLOCK_SCHEMAS));
  });

  test("canonical YAML matches the gallery and validates without default insertion", () => {
    const sources = markdown
      .parse(renderBlocksReference(), {})
      .filter((token) => token.type === "fence" && token.info === "yaml")
      .map((token) => token.content.trimEnd());
    const gallerySources = buildGalleryBlocks()
      .filter(
        (block) => block.type === "code-block" && block.language === "yaml",
      )
      .map((block) => block.code);
    expect(sources).toEqual(gallerySources);
    const examples = sources.flatMap((source) => YAML.parse(source).blocks);
    expect(examples).toEqual(BLOCK_EXAMPLES.map(({ example }) => example));
    expect(collectBlockErrors(examples)).toEqual([]);
  });

  test("common wrapper fields are generated from their shared schema", () => {
    const common = parseMarkdown(renderBlocksReference()).querySelector(
      "table",
    );
    expect(
      [...common.querySelectorAll("tbody tr td:first-child")].map(
        (cell) => cell.textContent,
      ),
    ).toEqual(Object.keys(CONTAINER_FIELDS));
    expect(tableRows(renderFieldTable(CONTAINER_FIELDS))).toEqual([
      ["dark", "boolean", "optional", "Not documented", "Dark", ""],
      ["compact", "boolean", "optional", "Not documented", "Compact", ""],
    ]);
  });

  test("column compatibility covers only registered types and agrees with runtime placement checks", () => {
    const rows = tableRows(renderBlocksReference()).filter(
      (row) => row.length === 3,
    );
    expect(rows.map(([type]) => type)).toEqual(Object.keys(BLOCK_SCHEMAS));
    for (const [type, width, compatibility] of rows) {
      expect(width, type).toBe(getBlockContainerWidth(type));
      const check = () => assertColumnSafeTypes([type], "documentation test");
      if (compatibility === "No")
        expect(check, type).toThrow(`Block type "${type}"`);
      else {
        expect(compatibility, type).toBe("Yes");
        expect(check, type).not.toThrow();
      }
    }
  });

  test("CMS-reachable blocks have documented components and editor availability", () => {
    const cms = YAML.parse(readFileSync(join(rootDir, ".pages.yml"), "utf8"));
    const references = collectBlockReferences(cms);
    expect(references.length).toBeGreaterThan(0);
    const rendered = parseMarkdown(renderBlocksReference());
    const code = [...rendered.querySelectorAll("code")].map(
      (node) => node.textContent,
    );
    for (const { name, component } of references) {
      expect(code, name).toContain(component);
      expect(BLOCK_DOCS[name]?.summary, name).toBeTruthy();
    }
    const availability = [...rendered.querySelectorAll("p")].filter((node) =>
      node.textContent.startsWith("CMS collection availability:"),
    );
    expect(availability.map((node) => node.textContent)).toEqual(
      BLOCK_EXAMPLES.map(
        ({ collections }) =>
          `CMS collection availability: ${collections === null ? "All collections with a block editor" : collections.join(", ")}`,
      ),
    );
    expect(rendered.body.textContent).toContain(
      "editor allowlist, not a runtime restriction",
    );
  });

  test("all schema and resolved template paths are documented and exist", () => {
    const code = [
      ...parseMarkdown(renderBlocksReference()).querySelectorAll("code"),
    ].map((node) => node.textContent);
    for (const type of Object.keys(BLOCK_SCHEMAS)) {
      expect(code, type).toContain(`src/_lib/utils/block-schema/${type}.js`);
      expect(code, type).toContain(`src/_includes/${getBlockTemplate(type)}`);
      if (BLOCK_DOCS[type].scss)
        expect(code, type).toContain(BLOCK_DOCS[type].scss);
    }
    const paths = code.filter(
      (text) => text.startsWith("src/") && !text.includes("\n"),
    );
    expect(paths.length).toBeGreaterThan(Object.keys(BLOCK_SCHEMAS).length);
    for (const path of paths)
      expect(statSync(join(rootDir, path)).isFile(), path).toBe(true);
  });

  test("navigation and canonical references link to existing local files and block anchors", () => {
    const files = [
      join(rootDir, "BLOCKS_LAYOUT.md"),
      BLOCKS_PATH,
      LAYOUTS_PATH,
    ];
    const documents = new Map(
      files.map((file) => [file, parseMarkdown(readFileSync(file, "utf8"))]),
    );
    const sources = [
      ...documents,
      // Exercise uncached targets and Title Case headings at several levels.
      [
        LAYOUTS_PATH,
        parseMarkdown(
          [
            "[Reference](../../../docs/developer-reference.md#developer-reference)",
            "[Tokens](../../../docs/developer-reference.md#theme-source-tokens)",
            "[Formatting](../../../docs/developer-reference.md#files-and-formatting)",
          ].join("\n\n"),
        ),
      ],
    ];
    for (const [file, source] of sources) {
      const links = [...source.querySelectorAll("a")].map((link) =>
        link.getAttribute("href"),
      );
      expect(links.length, file).toBeGreaterThan(0);
      for (const href of links) {
        const [path, anchor] = href.split("#");
        const target = path ? resolve(dirname(file), path) : file;
        expect(statSync(target).isFile(), href).toBe(true);
        if (anchor) {
          const targetDocument = documents.has(target)
            ? documents.get(target)
            : parseMarkdown(readFileSync(target, "utf8"));
          const headings = [
            ...targetDocument.querySelectorAll("h1, h2, h3, h4, h5, h6"),
          ].map((node) =>
            node.textContent.trim().toLowerCase().replace(/\s+/g, "-"),
          );
          expect(headings, href).toContain(decodeURIComponent(anchor));
        }
      }
    }
  });
});

describe("full field schema rendering", () => {
  test("recurses through optional objects and nested lists while preserving required children", () => {
    const fields = {
      panel: {
        type: "object",
        fields: {
          groups: {
            type: "object",
            list: true,
            fields: {
              button: {
                type: "object",
                fields: { text: { type: "string", required: true } },
              },
            },
          },
        },
      },
    };
    expect(
      tableRows(renderFieldTable(fields)).map((row) => row.slice(0, 3)),
    ).toEqual([
      ["panel", "object", "optional"],
      ["panel.groups", "array<object>", "optional"],
      ["panel.groups[].button", "object", "optional"],
      ["panel.groups[].button.text", "string", "required"],
    ]);
  });

  test.each([
    [false, "false"],
    [0, "0"],
    ["", '""'],
    [undefined, "Not documented"],
    ['"center"', '"center"'],
  ])("preserves documented default %j independently from required presence", (value, displayed) => {
    const rows = tableRows(
      renderFieldTable({
        setting: { type: "string", required: true, default: value },
      }),
    );
    expect(rows[0].slice(2, 4)).toEqual(["required", displayed]);
  });

  test("escapes pipes, backticks, HTML, links, and newlines without corrupting table cells", () => {
    const label = "Label | <img> & [link](https://example.test)";
    const description = "`code` | <script>alert(1)</script>\n**not emphasis**";
    const source = renderFieldTable({
      "a|`b": {
        type: "string",
        label,
        description,
        default: "`x`|<b>\r\nnext",
      },
    });
    const rendered = parseMarkdown(source);
    expect(rendered.querySelectorAll("tbody tr")).toHaveLength(1);
    const cells = [...rendered.querySelectorAll("tbody td")];
    expect(cells).toHaveLength(6);
    expect(cells.map((node) => node.textContent)).toEqual([
      "a|`b",
      "string",
      "optional",
      "`x`|<b> next",
      label,
      "`code` | <script>alert(1)</script>**not emphasis**",
    ]);
    expect(rendered.querySelectorAll("img, script, a, strong, b")).toHaveLength(
      0,
    );
    expect(cells[5].querySelectorAll("br")).toHaveLength(1);
  });

  test("documents actual nested fields omitted from the old flattened reference", () => {
    const rows = tableRows(renderBlocksReference());
    expect(rows).toContainEqual([
      "buttons[].text",
      "string",
      "required",
      "Not documented",
      "Button Text",
      "",
    ]);
    expect(rows).toContainEqual([
      "buttons[].href",
      "string",
      "required",
      "Not documented",
      "URL",
      "",
    ]);
    expect(rows).toContainEqual([
      "items[].description",
      "markdown",
      "optional",
      "Not documented",
      "Description",
      "",
    ]);
    expect(
      rows.some(
        ([path, type]) => path === "filter.property" && type === "string",
      ),
    ).toBe(true);
    expect(
      rows.some(([path, type]) => path === "items" && type === "array<string>"),
    ).toBe(true);
  });

  test("retains reference collection options and pipe-delimited list alternatives", () => {
    const referenceRows = tableRows(renderFieldTable(BLOCK_SCHEMAS.snippet));
    expect(referenceRows[0][1]).toBe("reference");
    expect(referenceRows[0][5]).toContain(
      'CMS options: {"collection":"snippets"}',
    );
    const statsRows = tableRows(renderFieldTable(BLOCK_SCHEMAS.stats));
    expect(statsRows[0][5]).toContain('Also accepts "value|label" strings.');
    expect(statsRows.find(([path]) => path === "items[].value")[2]).toBe(
      "required",
    );
  });
});
