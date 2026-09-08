import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  readDeveloperReferenceInputs,
  renderDeveloperReference,
} from "#scripts/generate-developer-reference.js";
import { rootDir } from "#test/test-utils.js";

describe("developer-reference-freshness", () => {
  test("the committed reference matches current source inputs without rewriting it", () => {
    const committed = readFileSync(
      join(rootDir, "docs/developer-reference.md"),
      "utf8",
    );
    const generated = renderDeveloperReference(readDeveloperReferenceInputs());
    expect(generated, "Run npm run generate-developer-reference").toBe(
      committed,
    );
  });
});
