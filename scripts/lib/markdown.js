/** Literal Markdown for generated references, including GFM table cells. */

/** @param {unknown} value */
export const escapeText = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replace(/[\\`*_[\]~|#!+.=)-]/g, (char) => `&#${char.charCodeAt(0)};`)
    .replace(/\r\n|\r|\n/g, "<br>");

// HTML avoids code-span whitespace normalization and GFM's backslash/pipe rules.
/** @param {unknown} value */
export const inlineCode = (value) => `<code>${escapeText(value)}</code>`;

/** Cells are already escaped/formatted by the caller.
 * @param {string[]} headers @param {string[][]} rows
 */
export const markdownTable = (headers, rows) =>
  [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");

/** @param {string} text @param {string} language */
export const fencedCode = (text, language) => {
  const length = [...text.matchAll(/`+/g)].reduce(
    (longest, [run]) => Math.max(longest, run.length),
    2,
  );
  const fence = "`".repeat(length + 1);
  return `${fence}${language}\n${text}${text.endsWith("\n") ? "" : "\n"}${fence}`;
};
