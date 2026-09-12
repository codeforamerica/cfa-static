import path from "node:path";
import { validateCssVariables } from "#build/css-variable-validator.js";
import { generateThemeSwitcherContent } from "#build/theme-compiler.js";
import getConfig from "#data/config.js";

// Lazy-loaded sass module
/** @type {typeof import("sass") | null} */
let sass = null;

// Files that should be compiled (not just imported as partials)
const COMPILED_BUNDLES = ["design-system-bundle.scss"];

/**
 * @param {string} inputContent
 * @param {string} inputPath
 * @returns {(data: unknown) => Promise<string>}
 */
const createScssCompiler = (inputContent, inputPath) => {
  const dir = path.dirname(inputPath);
  const isBundle = shouldCompileScss(inputPath);

  return async (_data) => {
    const content =
      isBundle && getConfig().enable_theme_switcher
        ? `${inputContent}\n\n${generateThemeSwitcherContent()}`
        : inputContent;

    if (!sass) {
      sass = await import("sass");
    }
    const css = sass.compileString(content, {
      loadPaths: [dir],
    }).css;

    if (isBundle) {
      validateCssVariables(css, inputPath);
    }

    return css;
  };
};

/** @param {string} inputPath */
const shouldCompileScss = (inputPath) =>
  COMPILED_BUNDLES.some((bundle) => inputPath.endsWith(bundle));

/** @param {import("@11ty/eleventy").UserConfig} eleventyConfig */
const configureScss = (eleventyConfig) => {
  // Explicitly watch CSS directory to trigger rebuilds when partials change
  eleventyConfig.addWatchTarget("./src/css/");

  eleventyConfig.addTemplateFormats("scss");
  eleventyConfig.addExtension("scss", {
    outputFileExtension: "css",
    useLayouts: false,
    compile:
      /**
       * @param {string} inputContent
       * @param {string} inputPath
       */
      (inputContent, inputPath) => {
        // Only compile specified bundles, skip all other scss files
        if (!shouldCompileScss(inputPath)) {
          return () => undefined;
        }
        return createScssCompiler(inputContent, inputPath);
      },
  });
};

export { configureScss, createScssCompiler, shouldCompileScss };
