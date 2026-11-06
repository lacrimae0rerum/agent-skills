// Adapted from the upstream MIT-licensed tool (see LICENSE.txt): skills/Assay/Tools/Stats.ts (mean, sem, pairedDiff).
/**
 * The statistics an EvalRound film round needs: a mean, and the paired difference of two arms with its
 * 95% confidence interval (Anthropic, "A Statistical Approach to Model Evaluations", Nov 2024: compare two
 * configurations on the SAME cases with paired differences). Pure functions, no dependencies.
 */

export interface PairedResult {
  n: number;
  mean_diff: number; // mean(b - a): positive = B better
  sem: number;
  ci95_lo: number;
  ci95_hi: number;
  significant: boolean; // 95% CI excludes 0
  correlation: number; // Pearson r between arms
}

const Z95 = 1.959964;

export function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((s, x) => s + x, 0) / xs.length;
}

function sampleVariance(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
}

/** Standard error of the mean. 0 when n < 2 (report, don't crash, on tiny suites). */
export function sem(xs: number[]): number {
  return xs.length < 2 ? 0 : Math.sqrt(sampleVariance(xs) / xs.length);
}

/** Paired-difference comparison of two arms over the SAME cases, index-aligned. */
export function pairedDiff(a: number[], b: number[]): PairedResult {
  if (a.length !== b.length) throw new Error(`pairedDiff: arms differ in length (${a.length} vs ${b.length}) — pair per-case scores, index-aligned`);
  const diffs = b.map((x, i) => x - a[i]!);
  const md = mean(diffs);
  const se = sem(diffs);
  const lo = md - Z95 * se;
  const hi = md + Z95 * se;
  const ma = mean(a);
  const mb = mean(b);
  const cov = a.length < 2 ? 0 : a.reduce((s, x, i) => s + (x - ma) * (b[i]! - mb), 0) / (a.length - 1);
  const denom = Math.sqrt(sampleVariance(a) * sampleVariance(b));
  return {
    n: a.length,
    mean_diff: md,
    sem: se,
    ci95_lo: lo,
    ci95_hi: hi,
    significant: a.length >= 2 && (lo > 0 || hi < 0),
    correlation: denom === 0 ? 0 : cov / denom,
  };
}
