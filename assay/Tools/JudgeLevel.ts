/**
 * Judge-model → inference-level resolution for the model-based graders.
 *
 * A suite may name its judge by capability (`judge_model: haiku`, `sonnet`, `opus`, a model id such as
 * `claude-sonnet-…` or `gpt-5-mini`, or a level word `low` | `medium` | `high`). This file turns that
 * intent into the inference helper's `level`, so one definition serves every judge and no hardcoded id
 * map can rot. Vendor selection stays in the shared inference configuration.
 *
 * Grading caps at `high`: a judge spec can never uplevel itself to the top rung. JUDGE STRENGTH: a judge
 * is at least as capable as the work it grades, so the ceiling rises to the subject's rung when the caller
 * names the subject; with no subject named the ceiling stays `high`.
 *
 * Adapted from the upstream MIT-licensed tool (see LICENSE.txt).
 */
import type { InferenceLevel as EffortLevel } from './_portable/inference.ts';

/** Grading never rides the top rung unless the work it grades does. */
const GRADING_CEILING: EffortLevel = "high";
const ORDER: EffortLevel[] = ["low", "medium", "high", "max"];

/** The capability rung a model name or id expresses, or null when it names none. */
export function levelOfModel(model: string): EffortLevel | null {
  const raw = model.trim().toLowerCase();
  if ((ORDER as string[]).includes(raw)) return raw as EffortLevel;
  const claude = raw.match(/^(?:claude-(?:\d+-\d+-)?)?(haiku|sonnet|opus|fable)\b/);
  if (claude) return ({ haiku: "low", sonnet: "medium", opus: "high", fable: "max" } as const)[claude[1] as "haiku" | "sonnet" | "opus" | "fable"];
  if (/^gpt-[\w.]*-(?:mini|nano)\b|^o\d-mini\b/.test(raw)) return "low";
  if (/^gpt-|^o\d\b/.test(raw)) return "high";
  if (/^gemini-[\w.]*-(?:flash|lite)/.test(raw)) return "low";
  if (/^gemini-/.test(raw)) return "high";
  return null;
}

/**
 * Resolve a judge-model string to an inference level. Absent → medium, explicit unknown → error.
 * Never returns above the ceiling.
 */
export function judgeLevelForModel(judgeModel?: string, subjectModel?: string): EffortLevel {
  if (!judgeModel) return "medium";
  const subject = subjectModel ? levelOfModel(subjectModel) : null;
  const ceiling: EffortLevel = subject && ORDER.indexOf(subject) > ORDER.indexOf(GRADING_CEILING) ? subject : GRADING_CEILING;
  const level = levelOfModel(judgeModel);
  if (!level) throw new Error(`Unknown judge_model '${judgeModel}'; use a model alias (haiku, sonnet, opus), a model id, or judge_level`);
  // Cap: a top-rung request degrades to the ceiling rather than erroring, so an old spec still grades — but it never uplevels.
  return ORDER.indexOf(level) > ORDER.indexOf(ceiling) ? ceiling : level;
}
