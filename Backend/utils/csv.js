/**
 * CSV export helpers.
 * - RFC 4180 quoting for commas, quotes and line breaks.
 * - Leading formula characters (= + - @ tab) are prefixed with an apostrophe
 *   so exported values can never execute inside Excel/Sheets.
 */
function escapeCell(value) {
  if (value === null || value === undefined) return "";

  let text = value instanceof Date ? value.toISOString() : String(value);

  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;

  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/**
 * @param {Record<string, any>[]} rows
 * @param {{ key: string, label: string }[]} columns
 */
export function toCsv(rows, columns) {
  const header = columns.map((column) => escapeCell(column.label)).join(",");
  const lines = rows.map((row) =>
    columns.map((column) => escapeCell(row[column.key])).join(","),
  );
  // BOM so Excel opens UTF-8 correctly.
  return `\uFEFF${[header, ...lines].join("\r\n")}\r\n`;
}

export default toCsv;
