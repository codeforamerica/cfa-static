#!/usr/bin/env node

/**
 * Keep jscpd's binary at `.bin/jscpd`, downloading and verifying it on first
 * use. The cpd scans run jscpd through `ensureJscpd`-style resolution in
 * scripts/cpd.js; the devenv shell and pre-commit hook call this installer
 * so the repository's own cpd checks never touch the npm-shipped binary on
 * NixOS.
 *
 * jscpd v5 is a Rust binary shipped through npm. The platform package npm
 * picks on a glibc Linux (`jscpd-linux-x64-gnu`) is dynamically linked, so a
 * NixOS machine cannot start it. The musl package is a fully static binary
 * that runs anywhere, so this fetches that one and pins its checksum.
 */

import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { ROOT_DIR } from "#lib/paths.js";
import { isMainModule } from "#scripts/lib/is-main-module.js";

export const JSCPD_VERSION = "5.2.0";
export const JSCPD_URL = `https://registry.npmjs.org/jscpd-linux-x64-musl/-/jscpd-linux-x64-musl-${JSCPD_VERSION}.tgz`;
export const JSCPD_SHA256 =
  "6dc6cdd9d245b485e5382872546e406e1d608500832a63644353b97b1faedf8c";

/** @type {{ binaryPath: string, binDir: string }} */
export const jscpdPaths = {
  binaryPath: join(ROOT_DIR, ".bin", "jscpd"),
  binDir: join(ROOT_DIR, ".bin"),
};

/** @param {Buffer} bytes @returns {string} */
const sha256Hex = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** @param {Buffer} block @returns {{ name: string, size: number }} */
const tarHeader = (block) => ({
  name: block.subarray(0, 100).toString("utf8").replace(/\0.*$/, ""),
  size: Number.parseInt(
    block.subarray(124, 136).toString("utf8").replace(/\0.*$/, "").trim(),
    8,
  ),
});

/**
 * Extract `package/bin/jscpd` from the npm tarball's raw bytes.
 * @param {Buffer} tar
 * @returns {Buffer}
 */
const jscpdEntryFromTar = (tar) => {
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tarHeader(tar.subarray(offset, offset + 512));
    offset += 512;
    if (header.name === "") break;
    if (header.name === "package/bin/jscpd") {
      return tar.subarray(offset, offset + header.size);
    }
    offset += Math.ceil(header.size / 512) * 512;
  }
  throw new Error("The jscpd tarball holds no package/bin/jscpd entry");
};

/** @param {string} url @returns {Promise<Buffer>} */
const downloadTarball = async (url) => {
  const response = await fetch(url);
  // The registry serves the tarball only on 200; anything else fails loudly
  // rather than parsing a redirect or error body as a binary.
  if (response.status !== 200) {
    throw new Error(`Failed to download jscpd: HTTP ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
};

/** Install the pinned binary when the cached one is missing or wrong. */
export const installJscpd = async (paths = jscpdPaths) => {
  const cached = existsSync(paths.binaryPath)
    ? sha256Hex(readFileSync(paths.binaryPath))
    : null;
  if (cached === JSCPD_SHA256) return paths.binaryPath;

  mkdirSync(paths.binDir, { recursive: true });
  const tar = gunzipSync(await downloadTarball(JSCPD_URL));
  const binary = jscpdEntryFromTar(tar);
  if (sha256Hex(binary) !== JSCPD_SHA256) {
    throw new Error("jscpd binary checksum mismatch");
  }

  const staged = join(tmpdir(), `jscpd-${process.pid}`);
  writeFileSync(staged, binary);
  chmodSync(staged, 0o700);
  renameSync(staged, paths.binaryPath);
  return paths.binaryPath;
};

/** The jscpd binary path if it is already installed and verified. */
export const installedJscpd = (paths = jscpdPaths) =>
  existsSync(paths.binaryPath) &&
  sha256Hex(readFileSync(paths.binaryPath)) === JSCPD_SHA256
    ? paths.binaryPath
    : null;

if (isMainModule(import.meta.url)) {
  const path = await installJscpd();
  console.log(`jscpd ${JSCPD_VERSION} ready at ${resolve(path)}`);
}
