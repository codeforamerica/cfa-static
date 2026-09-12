import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, test, vi } from "vitest";

const runJscpd = vi.fn();
const loadCpdDuplicates = vi.fn();
vi.mock("#scripts/cpd.js", () => ({
  runJscpd: (...args) => runJscpd(...args),
  loadCpdDuplicates: (...args) => loadCpdDuplicates(...args),
}));

const { configMinTokens, main, readConfigMinTokens } = await import(
  "#scripts/cpd-ratchet.js"
);
const { captureCliFailure, noop } = await import("#test/test-utils.js");

const expectRatchetFailure = async (expectedMessage) => {
  const { errors, exitError } = await captureCliFailure(main);
  expect(exitError).toBe("exit:1");
  expect(errors.join("\n")).toContain(expectedMessage);
};

describe("cpd-ratchet main", () => {
  beforeEach(() => {
    runJscpd.mockReset();
    loadCpdDuplicates.mockReset();
  });

  test("fails when the strict scan passes at a stricter threshold", async () => {
    runJscpd.mockReturnValueOnce(0);

    await expectRatchetFailure(
      "Update --min-tokens in the package.json cpd script",
    );
  });

  test("fails when the config-driven scan passes at a stricter threshold", async () => {
    runJscpd.mockReturnValueOnce(1); // strict scan still finds duplication
    loadCpdDuplicates.mockReturnValueOnce([{}]);
    runJscpd.mockReturnValueOnce(0); // config scan is clean one notch lower

    await expectRatchetFailure("Update minTokens in .jscpd.json");
  });

  test("passes when duplication appears one notch lower on both scans", () => {
    runJscpd.mockReturnValue(1);
    loadCpdDuplicates.mockReturnValue([{}, {}]);
    const logSpy = vi.spyOn(console, "log").mockImplementation(noop);

    main();

    expect(runJscpd).toHaveBeenCalledTimes(2);
    expect(runJscpd).toHaveBeenNthCalledWith(
      1,
      expect.arrayContaining(["--min-tokens", "--silent", "--output"]),
      expect.stringContaining("jscpd-report.json"),
    );
    expect(runJscpd).toHaveBeenNthCalledWith(
      2,
      expect.arrayContaining(["--min-tokens", "--silent", "--output"]),
      expect.stringContaining("jscpd-report.json"),
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("CPD ratchet passed"),
    );
    logSpy.mockRestore();
  });

  test("configMinTokens rejects non-integer or below-2 minTokens", () => {
    expect(() => configMinTokens({ minTokens: "32" })).toThrow(
      /must record an integer minTokens/,
    );
    expect(() => configMinTokens({})).toThrow(
      /must record an integer minTokens/,
    );
    expect(() => configMinTokens({ minTokens: 1 })).toThrow(
      /must record an integer minTokens/,
    );
    expect(configMinTokens({ minTokens: 32 })).toBe(32);
  });

  test("readConfigMinTokens reports the committed config threshold", () => {
    const config = JSON.parse(readFileSync(".jscpd.json", "utf-8"));

    expect(readConfigMinTokens()).toBe(config.minTokens);
  });
});
