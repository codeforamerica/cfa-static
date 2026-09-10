import { spawnSync } from "node:child_process";
import { chmodSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import YAML from "yaml";
import { createTempFile, rootDir, withTempDir } from "#test/test-utils.js";

const workflow = YAML.parse(
  readFileSync(
    join(rootDir, ".github/workflows/sharedservices-deploy.yaml"),
    "utf8",
  ),
);
const build = workflow.jobs.build;
const buildStep = build.steps.find((step) => step.name === "Build site");

test("publishes only the successful build artifact through the shared workflow", () => {
  const upload = build.steps.find((step) => step.id === "upload");
  expect(build.environment).toBe("development");
  expect(buildStep.env.SITE_URL).toBe("${{ vars.SITE_URL }}");
  expect(upload.with).toMatchObject({
    path: "_site",
    "if-no-files-found": "error",
  });
  expect(build.outputs["artifact-id"]).toBe(
    "${{ steps.upload.outputs.artifact-id }}",
  );
  expect(workflow.jobs.deploy).toEqual({
    needs: "build",
    uses: "codeforamerica/shared-services-infra/.github/workflows/shared-deploy-static.yaml@main",
    with: {
      artifact_ids: "${{ needs.build.outputs.artifact-id }}",
      environment: "development",
    },
    secrets: "inherit",
  });
  expect(Object.keys(workflow.on)).toEqual(["workflow_dispatch"]);
});

test.each([
  "",
  "https://internal.example.test",
])("requires a site URL before invoking the build: %j", (siteUrl) => {
  withTempDir("sharedservices-build", (dir) => {
    const npm = createTempFile(
      dir,
      "npm",
      `#!${process.execPath}
process.stdout.write(JSON.stringify({ args: process.argv.slice(2), url: process.env.SITE_URL }));
`,
    );
    chmodSync(npm, 0o755);
    const result = spawnSync(buildStep.run, {
      shell: true,
      cwd: dir,
      env: { PATH: dir, SITE_URL: siteUrl },
      encoding: "utf8",
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(siteUrl ? 0 : 1);
    if (siteUrl) {
      expect(JSON.parse(result.stdout)).toEqual({
        args: ["run", "build"],
        url: siteUrl,
      });
    } else {
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("SITE_URL is required");
    }
  });
});
