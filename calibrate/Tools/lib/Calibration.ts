/**
 * Calibration — the agreement statistics and floors a calibrated judge must clear.
 *
 * The same floors the assay skill uses (Tools/lib/Calibration.ts there): agreement ≥ 0.85 and
 * Cohen's kappa ≥ 0.40 over the user's labels, with at least MIN_PER_RUNG labels per side.
 * Override per install with ASSAY_FLOOR_AGREEMENT and ASSAY_FLOOR_KAPPA (both skills read them).
 *
 * Adapted from MIT-licensed code (see LICENSE.txt).
 */
import { getEnv } from '../_portable/paths.ts';

export type Label = 'pass' | 'fail';
export type CalibrationFloors = { agreement: number; kappa: number };

export const DEFAULT_FLOORS: CalibrationFloors = { agreement: 0.85, kappa: 0.4 };
export const MIN_PER_RUNG = 2;

function floorEnv(name: string, fallback: number): number {
  const raw = getEnv(name);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 1) throw new Error(`${name} must be a number between 0 and 1 (got "${raw}")`);
  return n;
}

/** The agreement and Cohen's-kappa floors, read per call. */
export function calibrationFloors(): CalibrationFloors {
  return { agreement: floorEnv('ASSAY_FLOOR_AGREEMENT', DEFAULT_FLOORS.agreement), kappa: floorEnv('ASSAY_FLOOR_KAPPA', DEFAULT_FLOORS.kappa) };
}

/**
 * Cohen's kappa over (user label, judge verdict) pairs. Exactly 0 for any
 * constant judge; undefined (returned as 0) when expected agreement is 1,
 * which the per-rung minimum rules out for real sets.
 */
export function cohenKappa(pairs: { label: Label; judge: Label }[]): number {
  const n = pairs.length;
  if (n === 0) return 0;
  let agree = 0, lp = 0, jp = 0;
  for (const p of pairs) {
    if (p.label === p.judge) agree++;
    if (p.label === 'pass') lp++;
    if (p.judge === 'pass') jp++;
  }
  const po = agree / n;
  const pe = (lp / n) * (jp / n) + ((n - lp) / n) * ((n - jp) / n);
  if (pe >= 1) return 0;
  const k = (po - pe) / (1 - pe);
  return Number.isFinite(k) ? k : 0;
}
