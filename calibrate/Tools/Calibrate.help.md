# Calibrate.ts

User-labeled calibration sessions for one target (a skill intent's artifacts and judge). Run from this skill's folder, or give the full path to `Tools/Calibrate.ts`.

```
bun Tools/Calibrate.ts targets
bun Tools/Calibrate.ts discover    "<task in plain words>" [--json]
bun Tools/Calibrate.ts pool        --target <t> [--json]
bun Tools/Calibrate.ts session     --target <t> [--count 16] [--open] [--port 0] [--timeout-min 90] [--scored-only] [--seed <s>]
bun Tools/Calibrate.ts report      --target <t> [--session <id>] [--rescored] [--json]
bun Tools/Calibrate.ts taste-input --target <t>
bun Tools/Calibrate.ts taste       --target <t> --write <draft.json>
bun Tools/Calibrate.ts rescore     --target <t> [--session <id>] [--repeats 1] [--concurrency 4] [--dry-run]
```

## discover

Ranks every configured target and every eval suite of the `assay` skill (its suite folders and every suite with stored results; see `SKILL.md` § Data & Config) against the task words, matching whole words in the name, description and case ids. Usable candidates (a configured target, or a suite with stored outputs and judged asserts) always rank above unusable ones. Any suite name works as `--target` with no config: its stored run outputs are the pool, its judged asserts the judge, and its `pass_threshold` × 10 the bar.

## session

Selects `--count` distinct, unlabeled items, spread across the pool's judge-score tertiles plus unscored, at most two per source round until the pool forces more. Serves them on `127.0.0.1` with a per-session token and blocks. `--open` opens the page in the browser (`open` on macOS, `xdg-open` on Linux, `start` on Windows); otherwise give the user the URL from the ready event.

- stdout `{"event":"ready","session","url","count","requested","pool","labeled"}` once listening.
- stdout `{"event":"submitted","saved","likes","dislikes","withNotes","overall"}` then exit 0.
- stdout `{"event":"expired"}` then exit 3 after `--timeout-min`. No labels are written; the page keeps its draft in the browser.

Each item has a 0–10 slider and a notes box. Page keys: `j`/`k` move, `0`–`9` score, `t` 10, `c` notes, `Esc` leave notes, `z` zoom. Partial submits are allowed. A score at or above the target's `likeAt` (default 7) counts as a like; the raw score is kept on the label.

With `"selection": "newest"` a session takes the most recent unscored items in date order instead of sampling. A `frontmatter` pool reads published documents (`where`), their image field (`urlPrefix` mapped onto `localRoot`), date and title.

## report

Pairs each current label (latest verdict per image) with a judge score: the snapshot from when it was labeled, or with `--rescored` the latest rescore, leaving out (and counting) every label the rescoring taste was distilled from, so the earned verdict is held out. Prints agreement, Cohen's kappa, earned against the floors in `Tools/lib/Calibration.ts` (agreement 0.85, kappa 0.40, the same as the `assay` skill), confusion, the median of liked and disliked scores, a 0.25-step cut-off sweep ranked by balanced accuracy, the same per vendor, taste freshness, and every disagreement with the user's note.

## taste

Validates a draft `{summary, likes[], dislikes[]}` where every principle cites current label ids, stamps `target`, `updated`, `labels_hash`, `label_count`, and writes `Targets/<t>/Taste.json`.

## rescore

Text targets re-run the suite's judged asserts on each stored output with the taste appended, one judge call per judged assert. Image targets run the configured critique command (`CALIBRATE_CRITIQUE_CMD` or `critique` in `Config.md`, e.g. the critique tool of the `art-direction` skill) with `--image <file> --brief <Brief.json> --out <dir>` on each labeled image, the brief being the target's `Brief.json` plus `"calibration": "<t>"`, writing into `Targets/<t>/rescore/` (never beside the source image), and appends to `rescore.jsonl`. Two vision calls per image per repeat; `--dry-run` prints the plan. With no critique command configured, image rescore prints `{"event":"skipped"}` with that reason. A target with no `brief` and no `"judge": "evals"` is labels-only: rescore prints `{"event":"skipped"}` with the reason, names its `target.json` on stderr, and exits 0.

## Exit codes

0 success · 1 error · 3 session expired.
