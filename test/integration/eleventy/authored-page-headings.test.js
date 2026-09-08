import { readFileSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import { describe, expect, test } from "vitest";
import { ROOT_DIR } from "#lib/paths.js";
import { useSharedSite } from "#test/test-site-factory.js";

const pages = [
  ["pages/about.md", "about/index.html"],
  ["pages/contact.md", "contact/index.html"],
  ["pages/news.md", "news/index.html"],
  ["pages/not-found.md", "404.html"],
  ["pages/search.md", "search/index.html"],
  ["pages/theme-editor.md", "theme-editor/index.html"],
  ["guide-categories/getting-started.md", "guide/getting-started/index.html"],
  [
    "guide-pages/first-steps.md",
    "guide/getting-started/first-steps/index.html",
  ],
];

describe("authored page headings", () => {
  const getSite = useSharedSite({
    files: pages.map(([path]) => {
      const { data, content } = matter(
        readFileSync(join(ROOT_DIR, "src", path), "utf8"),
      );
      return { path, frontmatter: data, content };
    }),
  });

  test.each(
    pages,
  )("%s renders exactly one main H1", async (_source, output) => {
    const doc = await getSite().getDoc(output);
    expect(doc.querySelectorAll("main h1")).toHaveLength(1);
  });
});
