import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { fs, rootDir } from "#test/test-utils.js";

const forbiddenLockfiles = [
  "bun.lock",
  "bun.lockb",
  "yarn.lock",
  "pnpm-lock.yaml",
];

describe("lockfile", () => {
  test("only package-lock.json exists (this project uses npm)", () => {
    const foreignLockfiles = forbiddenLockfiles.filter((lockfile) =>
      fs.existsSync(resolve(rootDir, lockfile)),
    );
    expect(
      foreignLockfiles,
      "this project uses npm: remove the foreign lockfile(s) and rely on package-lock.json",
    ).toEqual([]);

    const npmLockPath = resolve(rootDir, "package-lock.json");
    expect(fs.existsSync(npmLockPath)).toBe(true);
  });
});
