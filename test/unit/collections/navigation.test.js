import { describe, expect, test, vi } from "vitest";
import {
  createMockEleventyConfig,
  expectResultTitles,
  item,
  withMockFetch,
} from "#test/test-utils.js";
import { map } from "#utils/fp/array.js";

vi.mock("#data/config.js", async () => {
  const { DEFAULTS } = await import("#config/helpers.js");
  return {
    default: () => ({
      ...DEFAULTS,
      nav_thumbnails: true,
      internal_link_suffix: "",
    }),
  };
});

const { configureNavigation, toNavigation } = await import(
  "#collections/navigation.js"
);

const MOCK_SVG = '<svg xmlns="http://www.w3.org/2000/svg"><path/></svg>';

const withIconMock = (callback) => withMockFetch(MOCK_SVG, {}, callback);

const pageItem = (slug, url, tags = []) => ({
  data: { tags },
  fileSlug: slug,
  url,
});

const navItems = map(([title, navOptions]) =>
  item(title, { eleventyNavigation: navOptions }),
);

const configureWithMock = async () => {
  const mockConfig = createMockEleventyConfig();
  await configureNavigation(mockConfig);
  return mockConfig;
};

const getNavLinks = async (entries) => {
  const mockConfig = await configureWithMock();
  return mockConfig.collections.navigationLinks({
    getAll: () => navItems(entries),
  });
};

const navEntry = (key, options = {}) => ({
  key,
  title: options.title ?? key,
  url: options.url ?? `/${key.toLowerCase()}/`,
  pluginType: "eleventy-navigation",
  data: options.data ?? {},
  children: options.children ?? [],
});

describe("navigationLinks collection", () => {
  test("excludes items without eleventyNavigation data", async () => {
    const mockConfig = await configureWithMock();
    const result = mockConfig.collections.navigationLinks({
      getAll: () => [
        item("Included", { eleventyNavigation: { key: "included" } }),
        item("Excluded", {}),
      ],
    });
    expectResultTitles(result, ["Included"]);
  });

  test("sorts by eleventyNavigation.order", async () => {
    const result = await getNavLinks([
      ["Second", { key: "second", order: 2 }],
      ["First", { key: "first", order: 1 }],
    ]);
    expectResultTitles(result, ["First", "Second"]);
  });

  test("breaks ties on order using key alphabetically", async () => {
    const result = await getNavLinks([
      ["Zebra", { key: "zebra", order: 1 }],
      ["Apple", { key: "apple", order: 1 }],
      ["Banana", { key: "banana", order: 1 }],
    ]);
    expectResultTitles(result, ["Apple", "Banana", "Zebra"]);
  });

  test("sorts items without an order alphabetically at the end", async () => {
    const result = await getNavLinks([
      ["No Order Z", { key: "z" }],
      ["First", { key: "a", order: 1 }],
      ["No Order A", { key: "a-no" }],
    ]);
    expectResultTitles(result, ["First", "No Order A", "No Order Z"]);
  });

  test("breaks ties on order using the page name when keyless", async () => {
    const result = await getNavLinks([
      ["Zebra", { order: 1 }],
      ["Apple", { order: 1 }],
    ]);
    expectResultTitles(result, ["Apple", "Zebra"]);
  });
});

describe("configureNavigation wiring", () => {
  test("registers async toNavigation filter", async () => {
    const mockConfig = await configureWithMock();
    expect(await mockConfig.asyncFilters.toNavigation([])).toBe("");
  });

  test("registers the eleventy-navigation plugin", async () => {
    const mockConfig = await configureWithMock();
    expect(mockConfig.pluginCalls).toBeDefined();
    expect(mockConfig.pluginCalls.length).toBeGreaterThan(0);
  });
});

describe("toNavigation", () => {
  // Every site that publishes a search page has to name its search field, so
  // the tests that are about something else still supply a label.
  const renderNav = (pages, activeKey = "") =>
    toNavigation(pages, activeKey, "Search");

  test("returns empty string for empty pages", async () => {
    expect(await renderNav([])).toBe("");
  });

  test("renders the search form with a search input and submit button", () =>
    withIconMock(async () => {
      // search.md exists, so toNavigation appends the search item. The form's
      // body is `searchInput + searchButton`; assert both ended up inside it.
      const html = await renderNav([navEntry("Home", { url: "/" })]);
      expect(html).toContain('class="search-box"');
      expect(html).toContain('type="search"');
      expect(html).toContain("<button");
    }));

  test("names the search field and its icon button after the language", () =>
    withIconMock(async () => {
      // Both are unlabelled otherwise: the button holds only an icon, and the
      // field only a placeholder.
      const html = await toNavigation(
        [navEntry("Home", { url: "/" })],
        "",
        "Suchen",
      );
      expect(html).toContain('<button type="submit" aria-label="Suchen"');
      expect(html).toContain('aria-label="Suchen"');
      expect(html).toContain('placeholder="Suchen"');
    }));

  test("refuses to render a search field it cannot name", () =>
    withIconMock(async () => {
      await expect(
        toNavigation([navEntry("Home", { url: "/" })], ""),
      ).rejects.toThrow(/search_label/);
    }));

  test("throws when input is missing the eleventyNavigation pluginType", async () => {
    const bare = [{ key: "Home", title: "Home" }];
    await expect(toNavigation(bare)).rejects.toThrow(
      "toNavigation requires eleventyNavigation filter first",
    );
  });

  test("marks the active entry with class='active'", () =>
    withIconMock(async () => {
      const html = await renderNav([navEntry("Home", { url: "/" })], "Home");
      expect(html).toContain('class="active"');
      expect(html).toContain('href="/"');
    }));

  test("only marks the matching entry as active, not its siblings", () =>
    withIconMock(async () => {
      const html = await renderNav(
        [navEntry("Home", { url: "/" }), navEntry("About")],
        "About",
      );
      const activeMatches = html.match(/class="active"/g);
      expect(activeMatches).toHaveLength(1);
      expect(html).toMatch(/class="active"[^>]*>.*About/);
    }));

  test("renders children inside a nested ul", () =>
    withIconMock(async () => {
      const html = await renderNav(
        [
          navEntry("Products", {
            children: [navEntry("Category A"), navEntry("Category B")],
          }),
        ],
        "",
      );
      expect(html).toContain("Category A");
      expect(html).toContain("Category B");
      expect(html.match(/<ul/g)).toHaveLength(2);
    }));

  test("renders entries without a href when url is missing", () =>
    withIconMock(async () => {
      const html = await renderNav(
        [
          {
            key: "No Link",
            title: "No Link",
            pluginType: "eleventy-navigation",
            data: {},
            children: [],
          },
        ],
        "",
      );
      expect(html).toContain("No Link");
      expect(html).not.toContain("href=");
    }));

  test("does not render a thumbnail for root-level entries", () =>
    withIconMock(async () => {
      const html = await renderNav(
        [
          navEntry("Products", {
            data: { thumbnail: "images/placeholders/blue.svg" },
          }),
        ],
        "",
      );
      expect(html).not.toContain("<picture");
      expect(html).not.toContain("<img");
    }));

  test("renders a thumbnail for a child entry when nav_thumbnails is on", () =>
    withIconMock(async () => {
      const html = await renderNav(
        [
          navEntry("Products", {
            children: [
              navEntry("Category A", {
                data: { thumbnail: "images/placeholders/blue.svg" },
              }),
            ],
          }),
        ],
        "",
      );
      expect(html).toContain("<picture");
      expect(html).toContain("<img");
    }));
});
