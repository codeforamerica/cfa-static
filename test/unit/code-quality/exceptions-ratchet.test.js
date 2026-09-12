import { describe, expect, test } from "vitest";
import * as exceptions from "#test/code-quality/code-quality-exceptions.js";

/**
 * Entry-count ratchet for test/code-quality/code-quality-exceptions.js.
 *
 * The central exceptions file is a deletion-only legacy baseline: counts
 * may only go down. A count above the baseline fails with the offending
 * allowlist; a count below it fails with the ready-to-paste replacement
 * baseline so every deletion is locked in immediately.
 */

const RATCHET_BASELINE = Object.fromEntries([
  ["ALLOWED_DATA_FALLBACKS", 0],
  ["ALLOWED_DOM_CONSTRUCTOR", 1],
  ["ALLOWED_LET", 9],
  ["ALLOWED_MUTABLE_CONST", 20],
  ["ALLOWED_NULLISH_COALESCING", 5],
  ["ALLOWED_PROCESS_CWD", 2],
  ["ALLOWED_SINGLE_USE_FUNCTIONS", 25],
  ["ALLOWED_TEST_ONLY_EXPORTS", 44],
  ["ALLOWED_TRY_CATCHES", 6],
]);

// The module namespace is the allowlist map, resolved dynamically so a
// newly added set cannot bypass the ratchet.
const entryCounts = () =>
  Object.fromEntries(
    Object.entries(exceptions).map(([name, set]) => [name, set.size]),
  );

/** Log each drifted allowlist with its actual count and the baseline. */
const logCountDrift = (names, counts) => {
  for (const name of names) {
    console.log(
      `    ${name}: ${counts[name]} entries (baseline ${RATCHET_BASELINE[name]})`,
    );
  }
};

describe("exceptions-ratchet", () => {
  test("every exported allowlist is a Set", () => {
    const nonSets = Object.entries(exceptions)
      .filter(([, set]) => !(set instanceof Set))
      .map(([name]) => name);

    expect(nonSets).toEqual([]);
  });

  test("baseline covers every exported allowlist", () => {
    expect(Object.keys(exceptions).sort()).toEqual(
      Object.keys(RATCHET_BASELINE).sort(),
    );
  });

  test("allowlist entry counts do not exceed the ratchet baseline", () => {
    const counts = entryCounts();
    const grown = Object.keys(counts).filter(
      (name) => counts[name] > RATCHET_BASELINE[name],
    );

    if (grown.length > 0) {
      console.log("\n  Code-quality exceptions grew past the baseline:");
      logCountDrift(grown, counts);
      console.log(
        "\n  The central exceptions file is deletion-only: fix the code",
      );
      console.log(
        "  or fix the check - never add allowlist entries for new violations.",
      );
    }

    expect(grown).toEqual([]);
  });

  test("allowlist deletions are locked into the ratchet baseline", () => {
    const counts = entryCounts();
    const shrunk = Object.keys(counts).filter(
      (name) => counts[name] < RATCHET_BASELINE[name],
    );

    if (shrunk.length > 0) {
      const readyToPaste = Object.entries(counts)
        .map(([name, count]) => `  ["${name}", ${count}],`)
        .join("\n");

      console.log("\n  Allowlists shrank below the baseline:");
      logCountDrift(shrunk, counts);
      console.log("\n  Lock the win in - replace RATCHET_BASELINE in");
      console.log(
        "  test/unit/code-quality/exceptions-ratchet.test.js with:\n",
      );
      console.log(
        `const RATCHET_BASELINE = Object.fromEntries([\n${readyToPaste}\n]);`,
      );
    }

    expect(shrunk).toEqual([]);
  });
});
