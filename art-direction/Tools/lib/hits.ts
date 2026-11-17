// Adapted from MIT-licensed code (see LICENSE.txt).
/** hits.md parsing for layout QA: the times at which a film's reveals land. */

const TIME_HEADER = /^(?:t|s|time|times|sec|secs|seconds|at)\b|\b(?:time|sec|secs|seconds)\b/i;
const NUMERIC_CELL = /^(\d+(?:\.\d+)?)\s*s?$/i;
/** Units a header or note line puts after a number. A "120 BPM" line is a tempo, never a hit time. */
const NOT_A_TIME = /^(?:bpm|fps|hits?|beats?|bars?|%|hz|khz|db|lufs|px|x\b|frames?)/i;

const splitRow = (line: string): string[] => {
  const cells = line.trim().split('|').map((c) => c.trim());
  if (cells[0] === '') cells.shift();
  if (cells.length && cells[cells.length - 1] === '') cells.pop();
  return cells;
};

/**
 * Hit times from a hits.md. A markdown table is read by its time column (the header cell naming time or seconds,
 * e.g. `s (sec)`), so a number in a heading or note line is never a hit. With no table, lines of the form
 * `<time>[s] <label>` are read, and a line whose number carries a unit such as BPM is skipped. Throws when a table
 * has no time column or a time cell is not a number: that is reported as an error, never a pass.
 */
export function parseHitTimes(md: string): number[] {
  const lines = md.split('\n');
  const tables: string[][] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i]!.trim().startsWith('|')) continue;
    const block: string[] = [];
    while (i < lines.length && lines[i]!.trim().startsWith('|')) block.push(lines[i++]!);
    tables.push(block);
  }
  const isSeparator = (l: string) => splitRow(l).every((c) => /^:?-{2,}:?$/.test(c));
  const times: number[] = [];
  let timeTables = 0;
  for (const block of tables) {
    if (block.length < 2 || !isSeparator(block[1]!)) continue;
    const header = splitRow(block[0]!);
    const col = header.findIndex((h) => TIME_HEADER.test(h));
    if (col < 0) continue;
    timeTables++;
    for (const [n, row] of block.slice(2).entries()) {
      const cell = splitRow(row)[col] ?? '';
      const m = cell.match(NUMERIC_CELL);
      if (!m) throw new Error(`hits table row ${n + 1}: time cell "${cell}" under "${header[col]}" is not a number of seconds`);
      times.push(Number(m[1]));
    }
  }
  if (tables.length > 0) {
    if (timeTables === 0) throw new Error('hits.md has a table but no column header names the time (expected e.g. "s (sec)" or "time")');
    return times;
  }
  for (const line of lines) {
    if (/^\s*#/.test(line)) continue;
    const m = line.match(/^\s*(?:[-*]\s+)?(\d+(?:\.\d+)?)(\s*s\b)?\s*[-–—:]?\s*(\S.*)$/);
    if (!m) continue;
    if (!m[2] && NOT_A_TIME.test(m[3]!)) continue;
    times.push(Number(m[1]));
  }
  return times;
}
