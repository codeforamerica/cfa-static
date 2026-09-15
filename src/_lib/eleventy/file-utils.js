import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import markdownIt from "markdown-it";
import { registerFilters } from "#eleventy/register.js";
import { memoize } from "#utils/fp/memoize.js";
import { processLiquidStrings } from "#utils/liquid-render.js";
import { validateSidebarBlocks } from "#utils/sidebar-blocks.js";

/**
 * @typedef {{ type: string, content: string }} MarkdownToken
 * @typedef {{ children?: MarkdownToken[] }} MarkdownBlockToken
 * @typedef {{ tokens: MarkdownBlockToken[] }} MarkdownState
 */

/** @param {MarkdownBlockToken} token */
const stripTokenMarkers = (token) => {
  if (!token.children) return;
  for (const child of token.children) {
    if (child.type === "text") {
      child.content = child.content.replace(/\+\+/g, "");
    }
  }
};

/** @param {MarkdownState} state */
const stripPlusPlusRule = (state) => {
  for (const token of state.tokens) {
    stripTokenMarkers(token);
  }
};

/** @param {any} md */
const stripPlusPlus = (md) => {
  md.core.ruler.after("inline", "strip_plus_plus", stripPlusPlusRule);
};

/**
 * Disable indented code blocks so HTML emitted by Liquid includes inside
 * markdown content is never escaped into a code block. Fenced ``` blocks
 * still work for intentional code samples.
 * @param {any} md
 */
const disableIndentedCode = (md) => {
  md.disable("code");
};

/**
 * Require a blank line before a list. Front matter content is hard-wrapped at
 * 80 chars, so a wrapped prose sentence often continues on a line that starts
 * with a dash (e.g. "- and then..."). CommonMark normally lets such a line
 * interrupt a paragraph and turn into a bullet list. We refuse that
 * interruption, so a marker only starts a list when it follows a blank line.
 *
 * The guard fires only for top-level paragraphs (`listIndent < 0`): inside a
 * list, the same paragraph-terminator mechanism is what separates one item
 * from the next, so list items, nested lists and blank-line-separated lists
 * all keep working.
 * @param {any} md
 */
const requireBlankLineBeforeLists = (md) => {
  const { ruler } = md.block;
  // Capture the original rule before ruler.at() replaces it in place;
  // ruler.at() mutates the rule object, so reading `.fn` afterwards would
  // point back at this wrapper and recurse forever.
  const { fn: listRule, alt } = ruler.__rules__[ruler.__find__("list")];
  ruler.at(
    "list",
    /**
     * @param {any} state
     * @param {number} startLine
     * @param {number} endLine
     * @param {boolean} silent
     */
    (state, startLine, endLine, silent) => {
      if (silent && state.parentType === "paragraph" && state.listIndent < 0) {
        return false;
      }
      return listRule(state, startLine, endLine, silent);
    },
    { alt: alt.slice() },
  );
};

/** @param {any} md */
const amendMarkdown = (md) => {
  stripPlusPlus(md);
  disableIndentedCode(md);
  requireBlankLineBeforeLists(md);
};

const createMarkdownRenderer = () => {
  const md = new markdownIt({ html: true });
  amendMarkdown(md);
  return md;
};

/**
 * @typedef {{ context: { environments: Record<string, unknown> } }} LiquidFilterContext
 * @typedef {() => Promise<string>} AsyncHtmlProvider
 * @typedef {{ blocks?: Record<string, unknown>[] } & Record<string, unknown>} SnippetData
 */

/** @param {unknown[]} args */
const cacheKeyFromArgs = (args) => args.join(",");

/** @param {string} dirPath */
const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
};

/**
 * @param {string} name
 * @param {string} [baseDir]
 */
const loadSnippet = (name, baseDir = process.cwd()) => {
  const snippetName = path.basename(name, path.extname(name));
  const snippetPath = path.join(baseDir, "src/snippets", `${snippetName}.md`);
  return fs.existsSync(snippetPath) ? matter.read(snippetPath) : null;
};

const readSnippetData = memoize(
  /**
   * @param {string} name
   * @param {string} [baseDir]
   * @returns {SnippetData}
   */
  (name, baseDir = process.cwd()) => {
    const parsed = loadSnippet(name, baseDir);
    return parsed ? parsed.data : {};
  },
  { cacheKey: cacheKeyFromArgs },
);

const renderSnippet = memoize(
  /**
   * @param {string} name
   * @param {string} [defaultString]
   * @param {string} [baseDir]
   * @param {ReturnType<typeof markdownIt>} [mdRenderer]
   */
  async (
    name,
    defaultString = "",
    baseDir = process.cwd(),
    mdRenderer = createMarkdownRenderer(),
  ) => {
    const parsed = loadSnippet(name, baseDir);
    if (!parsed) return defaultString;

    return mdRenderer.render(parsed.content);
  },
  { cacheKey: cacheKeyFromArgs },
);

/** @param {string} name */
const snippetDataFilter = (name) => readSnippetData(name);

/**
 * @this {LiquidFilterContext}
 * @param {string} name
 */
async function snippetBlocksFilter(name) {
  return resolveSnippetBlocks(name, this.context.environments);
}

/**
 * Reads a snippet's blocks, optionally validates them, and resolves Liquid
 * expressions against the page context.
 *
 * @param {string} name
 * @param {Record<string, unknown>} context
 * @param {(blocks: any[]) => Record<string, unknown>[]} [validate]
 */
const resolveSnippetBlocks = (name, context, validate = (blocks) => blocks) => {
  const data = readSnippetData(name);
  if (!data?.blocks) return [];
  return processLiquidStrings(validate(data.blocks), context);
};

/**
 * Like snippet_blocks, but enforces that every block type is safe inside the
 * narrow right-content sidebar column.
 *
 * @this {LiquidFilterContext}
 * @param {string} name
 */
async function sidebarBlocksFilter(name) {
  return resolveSnippetBlocks(
    name,
    this.context.environments,
    validateSidebarBlocks,
  );
}

/**
 * @this {LiquidFilterContext}
 * @param {Record<string, unknown>[] | undefined | null} blocks
 */
async function renderBlockLiquidFilter(blocks) {
  if (!blocks) return [];
  return processLiquidStrings(blocks, this.context.environments);
}

/**
 * @param {string} name
 * @param {string} defaultString
 * @param {ReturnType<typeof markdownIt>} mdRenderer
 */
const renderSnippetShortcode = async (name, defaultString, mdRenderer) =>
  await renderSnippet(name, defaultString, process.cwd(), mdRenderer);

/**
 * @param {{ addFilter: Function, addAsyncFilter: Function, addShortcode: Function, addAsyncShortcode: Function }} eleventyConfig
 */
const configureFileUtils = (eleventyConfig) => {
  const mdRenderer = createMarkdownRenderer();

  registerFilters(eleventyConfig)({
    snippet_data: snippetDataFilter,
    markdown: /** @param {string | null | undefined} str */ (str) =>
      str ? mdRenderer.render(str) : "",
  });
  registerFilters(
    eleventyConfig,
    "addAsyncFilter",
  )({
    snippet_blocks: snippetBlocksFilter,
    sidebar_blocks: sidebarBlocksFilter,
    render_block_liquid: renderBlockLiquidFilter,
  });

  eleventyConfig.addAsyncShortcode(
    "render_snippet",
    /**
     * @param {string} name
     * @param {string} defaultString
     */
    async (name, defaultString) =>
      await renderSnippetShortcode(name, defaultString, mdRenderer),
  );
};

export { amendMarkdown, configureFileUtils, ensureDir };
