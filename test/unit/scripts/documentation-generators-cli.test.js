import { writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  readDeveloperReferenceInputs,
  renderDeveloperReference,
} from "#scripts/generate-developer-reference.js";
import { runIfMain } from "#scripts/lib/is-main-module.js";
import { renderBlocksReference } from "#scripts/lib/render-blocks-reference.js";
import "#scripts/generate-blocks-reference.js";
import { captureConsole, rootDir } from "#test/test-utils.js";

vi.mock("node:fs", async (importOriginal) => {
  const original = await importOriginal();
  const writeFileSync = vi.fn();
  return {
    ...original,
    writeFileSync,
    default: { ...original.default, writeFileSync },
  };
});
vi.mock("#scripts/lib/is-main-module.js", () => ({ runIfMain: vi.fn() }));

const entryPoints = Object.fromEntries(
  vi
    .mocked(runIfMain)
    .mock.calls.map(([url, main]) => [basename(new URL(url).pathname), main]),
);

const generators = [
  {
    script: "generate-blocks-reference.js",
    target: "skills/cfa-static-site-builder/references/blocks.md",
    render: renderBlocksReference,
  },
  {
    script: "generate-developer-reference.js",
    target: "docs/developer-reference.md",
    render: () => renderDeveloperReference(readDeveloperReferenceInputs()),
  },
];

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe.each(generators)("$script CLI", ({ script, target, render }) => {
  test("generated output ends with exactly one newline", () => {
    expect(render().match(/\n+$/)?.[0]).toBe("\n");
  });

  test("importing does not write the generated file", () => {
    expect(writeFileSync).not.toHaveBeenCalled();
  });

  test("the guarded entry point writes the rendered reference", () => {
    captureConsole(entryPoints[script]);
    expect(writeFileSync).toHaveBeenCalledExactlyOnceWith(
      join(rootDir, target),
      render(),
    );
  });
});
