import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";

/**
 * validated-config runs its checks at module load, so each test mocks
 * site.json and re-imports the module fresh.
 */
const importWithSite = async (site) => {
  vi.doMock("#data/site.json", () => ({ default: site }));
  vi.resetModules();
  return import("#config/validated-config.js");
};

afterEach(() => {
  vi.doUnmock("#data/site.json");
  vi.resetModules();
  vi.unstubAllEnvs();
});

describe("validated-config", () => {
  beforeAll(async () => {
    // Every test re-imports the module graph fresh. Pay the graph's cold
    // transform cost once here, inside the hook budget, so no individual
    // test's 1500ms limit has to carry it under parallel lane load.
    await importWithSite({
      name: "Configured Site",
      url: "https://configured.test",
      description: "A configured site",
    });
  });

  test("throws with a singular heading for one config error", async () => {
    await expect(
      importWithSite({
        name: "Configured Site",
        url: "https://configured.test/",
        description: "A configured site",
      }),
    ).rejects.toThrow(/Configuration error:\n.*must not end with a slash/s);
  });

  test("throws with a plural heading listing every error", async () => {
    await expect(
      importWithSite({
        name: "Configured Site",
        url: "ftp://configured.test/",
        description: "A configured site",
      }),
    ).rejects.toThrow(
      /Configuration errors \(2\):[\s\S]*1\..*slash[\s\S]*2\..*http or https/,
    );
  });

  test("exports the validated site url", async () => {
    const mod = await importWithSite({
      name: "Configured Site",
      url: "https://configured.test",
      description: "A configured site",
    });
    expect(mod.siteUrl).toBe("https://configured.test");
  });

  test("SITE_URL env overrides the canonical origin", async () => {
    vi.stubEnv("SITE_URL", "https://deployed.test");
    const mod = await importWithSite({
      name: "Configured Site",
      url: "https://configured.test",
      description: "A configured site",
    });
    expect(mod.siteUrl).toBe("https://deployed.test");
  });

  test.each([
    ["https://deployed.test/", "must not end with a slash"],
    ["ftp://deployed.test", "must use http or https protocol"],
    ["https://example.com", "uses a placeholder hostname"],
    ["not a URL", "is not a valid URL"],
    ["   ", "must be a non-empty URL"],
    [" https://deployed.test", "must not have leading or trailing whitespace"],
    [
      "https://deployed.test?preview=1",
      "must not include a query string or fragment",
    ],
    [
      "https://deployed.test#preview",
      "must not include a query string or fragment",
    ],
  ])("rejects an invalid SITE_URL override: %s", async (url, error) => {
    vi.stubEnv("SITE_URL", url);
    await expect(
      importWithSite({
        name: "Configured Site",
        url: "https://configured.test",
        description: "A configured site",
      }),
    ).rejects.toThrow(`SITE_URL ${error}`);
  });

  test.each([
    [{ url: "https://configured.test", description: "Description" }, "name"],
    [
      { name: "Configured Site", url: "https://configured.test" },
      "description",
    ],
  ])("rejects missing required identity fields", async (site, field) => {
    await expect(importWithSite(site)).rejects.toThrow(
      `site.json is missing the '${field}' field`,
    );
  });

  test.each([
    "Example Site",
    "Your Site Name",
    "Change Me",
  ])("rejects the placeholder site name %s", async (name) => {
    await expect(
      importWithSite({
        name,
        url: "https://configured.test",
        description: "A configured site",
      }),
    ).rejects.toThrow("is still a placeholder");
  });

  test.each([
    "https://example.com",
    "https://docs.example.org",
    "https://project.example",
  ])("rejects the placeholder site URL %s", async (url) => {
    await expect(
      importWithSite({
        name: "Configured Site",
        url,
        description: "A configured site",
      }),
    ).rejects.toThrow("uses a placeholder hostname");
  });
});
