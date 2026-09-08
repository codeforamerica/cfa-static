import { readFileSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import MarkdownIt from "markdown-it";
import { describe, expect, test } from "vitest";
import { parseAllDocuments } from "yaml";
import { ROOT_DIR } from "#lib/paths.js";
import { getFiles } from "#test/test-utils.js";
import { collectBlockErrors } from "#utils/block-schema.js";

const markdown = new MarkdownIt();

const fencedExamples = getFiles(
  /^(README\.md|src\/snippets\/README\.md|skills\/cfa-static-site-builder\/(SKILL\.md|references\/[^/]+\.md))$/,
).flatMap((file) =>
  markdown
    .parse(readFileSync(join(ROOT_DIR, file), "utf8"), {})
    .filter(
      (token) => token.type === "fence" && /^(yaml|yml)$/.test(token.info),
    )
    .map((token) => ({
      location: `${file}:${token.map[0] + 1}`,
      code: token.content,
    })),
);

const publishedExamples = getFiles(
  /^src\/(pages|guide-pages)\/[^/]+\.md$/,
).flatMap((file) => {
  const { data } = matter(readFileSync(join(ROOT_DIR, file), "utf8"));
  return (data.blocks || []).flatMap((block, index) => {
    const code =
      block.type === "code-block" && block.language === "yaml"
        ? block.code
        : block.type === "split-code" && block.figure_language === "yaml"
          ? block.figure_code
          : null;
    return code ? [{ location: `${file} block ${index + 1}`, code }] : [];
  });
});

// Only parse data. Shell, JavaScript, Liquid, and other prose examples are
// never executed. Frontmatter's closing --- becomes an empty YAML document.
const blockExamples = [...fencedExamples, ...publishedExamples].flatMap(
  ({ location, code }) =>
    parseAllDocuments(code).flatMap((document) => {
      if (document.errors.length > 0) {
        throw new Error(
          `Invalid YAML in ${location}: ${document.errors.join("\n")}`,
        );
      }
      const data = document.toJSON();
      const blocks = Array.isArray(data) ? data : data?.blocks;
      // Other YAML (for example a deployment workflow) is not block content.
      if (
        blocks === undefined ||
        (Array.isArray(data) && !data.some((b) => b?.type))
      ) {
        return [];
      }
      return [{ location, blocks }];
    }),
);

describe("documented YAML block examples", () => {
  test("discovers authored examples as well as generated canonical examples", () => {
    expect(
      blockExamples.some(({ location }) =>
        location.startsWith("src/snippets/README.md"),
      ),
    ).toBe(true);
    expect(
      blockExamples.some(({ location }) =>
        location.includes("references/content-authoring.md"),
      ),
    ).toBe(true);
    expect(
      blockExamples.some(({ location }) =>
        location.includes("references/blocks.md"),
      ),
    ).toBe(true);
  });
  test.each(
    blockExamples,
  )("$location validates against the production schema", ({
    location,
    blocks,
  }) => {
    expect(Array.isArray(blocks), location).toBe(true);
    expect(collectBlockErrors(blocks, ` in ${location}`)).toEqual([]);
  });
});
