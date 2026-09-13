import { EleventyHtmlBasePlugin, RenderPlugin } from "@awesome.me/buildawesome";
import schemaPlugin from "@quasibit/eleventy-plugin-schema";
import config from "#data/config.json" with { type: "json" };

// Path prefix for deployments that serve the site from a subdirectory
// (e.g. a GitHub Pages project site at /cfa-static/). The HTML base plugin
// rewrites rendered URLs; templates and frontend code read `pathPrefix`.
const PATH_PREFIX = process.env.PATH_PREFIX || "/";

import { configureJsBundler } from "#build/js-bundler.js";
import { configureScss } from "#build/scss.js";
import { configureGuides } from "#collections/guides.js";
import { configureNavigation } from "#collections/navigation.js";
import { configureNews } from "#collections/news.js";
import { configureBlocks } from "#eleventy/blocks.js";
import { configureBreadcrumbs } from "#eleventy/breadcrumbs.js";
import { configureCollectionLookup } from "#eleventy/collection-lookup.js";
import { amendMarkdown, configureFileUtils } from "#eleventy/file-utils.js";
import { configureFilters } from "#eleventy/filters.js";
import { configureHtmlTransform } from "#eleventy/html-transform.js";
import { configureLayoutAliases } from "#eleventy/layout-aliases.js";
import { configureScreenshots } from "#eleventy/screenshots.js";
import { configureStyleBundle } from "#eleventy/style-bundle.js";
import { configureCollectionValidation } from "#eleventy/validate-collections.js";
import { configureIconify } from "#media/iconify.js";
import { configureImages, processAndWrapImage } from "#media/image.js";
import { configureUnusedImages } from "#media/unused-images.js";

/** Every plugin registered with Eleventy, in registration order. */
const CONFIGURATORS = [
  configureBlocks,
  configureBreadcrumbs,
  configureCollectionLookup,
  configureFilters,
  configureLayoutAliases,
  configureFileUtils,
  configureGuides,
  /** @param {*} eleventyConfig */
  (eleventyConfig) =>
    configureHtmlTransform(eleventyConfig, processAndWrapImage),
  configureImages,
  configureIconify,
  configureNavigation,
  configureNews,
  configureScreenshots,
  configureScss,
  configureStyleBundle,
  configureUnusedImages,
  configureJsBundler,
];

/** @param {import("@awesome.me/buildawesome/UserConfig").default} eleventyConfig */
export default async function (eleventyConfig) {
  eleventyConfig.addWatchTarget("./src/**/*");
  eleventyConfig.setLayoutsDirectory("_layouts");
  if (!config.disable_liquid_cache) {
    eleventyConfig.setLiquidOptions({ cache: true });
  }
  eleventyConfig
    .addPassthroughCopy("src/assets")
    .addPassthroughCopy("src/files")
    .addPassthroughCopy("src/images")
    .addPassthroughCopy({ "src/assets/favicon/*": "/" });

  // Static analysis: validates template collection references before build
  configureCollectionValidation(eleventyConfig);

  eleventyConfig.addPlugin(schemaPlugin);
  eleventyConfig.addPlugin(RenderPlugin);
  eleventyConfig.addPlugin(EleventyHtmlBasePlugin);
  eleventyConfig.addGlobalData("pathPrefix", PATH_PREFIX);

  eleventyConfig.amendLibrary("md", amendMarkdown);

  for (const configure of CONFIGURATORS) {
    await configure(eleventyConfig);
  }

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      layouts: "_layouts",
      data: "_data",
    },
    pathPrefix: PATH_PREFIX,
    templateFormats: ["liquid", "md", "html"],
    htmlTemplateEngine: "liquid",
    markdownTemplateEngine: "liquid",
  };
}
