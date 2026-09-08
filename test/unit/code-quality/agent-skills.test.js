import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import matter from "gray-matter";
import MarkdownIt from "markdown-it";
import { describe, expect, test } from "vitest";
import { getFiles, rootDir } from "#test/test-utils.js";

const SKILL_NAME = "cfa-static-site-builder";
const SKILL_DIR = join(rootDir, "skills", SKILL_NAME);
const SKILL_FILE = join(SKILL_DIR, "SKILL.md");
const EVALS_FILE = join(SKILL_DIR, "evals", "evals.json");
const REAL_SKILL_DIR = realpathSync(SKILL_DIR);
const ALLOWED_FIELDS = [
  "allowed-tools",
  "compatibility",
  "description",
  "license",
  "metadata",
  "name",
];

const skillSource = readFileSync(SKILL_FILE, "utf-8");
const skill = matter(skillSource);
const evalConfig = JSON.parse(readFileSync(EVALS_FILE, "utf-8"));
const packageJson = JSON.parse(
  readFileSync(join(rootDir, "package.json"), "utf8"),
);
const markdown = new MarkdownIt();
const references = getFiles(
  /^skills\/cfa-static-site-builder\/references\/[^/]+\.md$/,
);

describe("CfA Static Agent Skill", () => {
  test("frontmatter follows the Agent Skills specification", () => {
    const unexpectedFields = Object.keys(skill.data).filter(
      (field) => !ALLOWED_FIELDS.includes(field),
    );

    expect(unexpectedFields).toEqual([]);
    expect(skill.data.name).toBe(basename(SKILL_DIR));
    expect(skill.data.name).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect(skill.data.name.length).toBeLessThanOrEqual(64);
    expect(skill.data.description).toEqual(expect.any(String));
    expect(skill.data.description.trim().length).toBeGreaterThan(0);
    expect(skill.data.description.length).toBeLessThanOrEqual(1024);
    if ("compatibility" in skill.data) {
      expect(skill.data.compatibility.trim().length).toBeGreaterThan(0);
      expect(skill.data.compatibility.length).toBeLessThanOrEqual(500);
    }
    if ("license" in skill.data) {
      expect(skill.data.license).toEqual(expect.any(String));
    }
    if ("allowed-tools" in skill.data) {
      expect(skill.data["allowed-tools"]).toEqual(expect.any(String));
    }
    if ("metadata" in skill.data) {
      expect(Array.isArray(skill.data.metadata)).toBe(false);
      expect(skill.data.metadata).toEqual(expect.any(Object));
      for (const value of Object.values(skill.data.metadata)) {
        expect(value).toEqual(expect.any(String));
      }
    }
  });

  test("progressive-disclosure references exist inside the skill", () => {
    const links = Array.from(
      skill.content.matchAll(/\]\(([^)]+)\)/g),
      (match) => match[1],
    ).filter((link) => !link.includes(":") && !link.startsWith("#"));

    expect(skillSource.split("\n").length).toBeLessThanOrEqual(500);
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      const target = resolve(dirname(SKILL_FILE), link.split("#")[0]);
      expect(relative(SKILL_DIR, target)).not.toMatch(/^\.\./);
      expect(existsSync(target), `Missing skill reference: ${link}`).toBe(true);
    }
  });

  test("evals define distinct behavioral scenarios", () => {
    expect(evalConfig.skill_name).toBe(SKILL_NAME);
    expect(evalConfig.evals.length).toBeGreaterThanOrEqual(3);

    const ids = evalConfig.evals.map((evaluation) => evaluation.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const evaluation of evalConfig.evals) {
      expect(evaluation.prompt).toEqual(expect.any(String));
      expect(evaluation.prompt.trim().length).toBeGreaterThan(0);
      expect(evaluation.expected_output).toEqual(expect.any(String));
      expect(evaluation.expected_output.trim().length).toBeGreaterThan(0);
      expect(evaluation.assertions.length).toBeGreaterThanOrEqual(2);
      for (const assertion of evaluation.assertions) {
        expect(assertion).toEqual(expect.any(String));
      }
      expect(evaluation.files).toEqual(expect.any(Array));
      for (const file of evaluation.files) {
        expect(file).toEqual(expect.any(String));
        expect(file.trim().length).toBeGreaterThan(0);
        const target = resolve(SKILL_DIR, file);
        expect(relative(SKILL_DIR, target)).not.toMatch(/^\.\./);
        expect(existsSync(target), `Missing eval fixture: ${file}`).toBe(true);
        const realTarget = realpathSync(target);
        expect(relative(REAL_SKILL_DIR, realTarget)).not.toMatch(/^\.\./);
        expect(statSync(realTarget).isFile()).toBe(true);
      }
    }
  });

  test("reference documents are included in documentation checks", () => {
    expect(references.length).toBeGreaterThan(0);
    expect(references).toContain(`skills/${SKILL_NAME}/references/blocks.md`);
    expect(references).toContain(`skills/${SKILL_NAME}/references/layouts.md`);
  });

  test.each(references)("%s links to existing checkout resources", (file) => {
    const source = readFileSync(join(rootDir, file), "utf8");
    const doc = new DOMParser().parseFromString(
      markdown.render(source),
      "text/html",
    );
    const links = [...doc.querySelectorAll("a")].map((link) =>
      link.getAttribute("href"),
    );
    for (const href of links.filter(
      (link) => !/^(?:[a-z]+:|\/\/)/i.test(link),
    )) {
      const [path, anchor] = href.split("#");
      const target = path
        ? resolve(rootDir, dirname(file), path)
        : join(rootDir, file);
      expect(relative(rootDir, target), href).not.toMatch(/^\.\./);
      expect(existsSync(target), `${file}: ${href}`).toBe(true);
      if (anchor) {
        const targetDoc =
          target === join(rootDir, file)
            ? doc
            : new DOMParser().parseFromString(
                markdown.render(readFileSync(target, "utf8")),
                "text/html",
              );
        const headings = [
          ...targetDoc.querySelectorAll("h1, h2, h3, h4, h5, h6"),
        ].map((heading) =>
          heading.textContent.trim().toLowerCase().replace(/\s+/g, "-"),
        );
        expect(headings, `${file}: ${href}`).toContain(
          decodeURIComponent(anchor),
        );
      }
    }
  });

  test.each([
    `skills/${SKILL_NAME}/SKILL.md`,
    ...references,
  ])("%s uses npm scripts declared by this checkout", (file) => {
    const source = readFileSync(join(rootDir, file), "utf8");
    const scripts = [...source.matchAll(/\bnpm run ([\w:-]+)/g)].map(
      (match) => match[1],
    );
    for (const name of scripts) {
      expect(
        Object.hasOwn(packageJson.scripts, name),
        `${file}: npm run ${name}`,
      ).toBe(true);
    }
  });
});
