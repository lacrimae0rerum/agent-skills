# Produce

`Script.json` → verified `Out/essay.mp4`, thumbnail, description, staged in `~/Downloads/`. Everything here is deterministic; the model reads results and judges frames.

## Ideal State

- `Out/essay.mp4` is 4K at 30 fps (a 1920x1080 composition rendered at 2x, 3840x2160) in the agent's configured voice, with one visual per beat entering for a reason (springs, texture in timing, one focal movement), the presence layer bottom-right (200 px avatar circle, the signal laid over its bottom band) with a signal that moves only when the voice does, chapter cards, and a progress hairline in the accent colour.
- `Out/verify.json` has every check `ok: true`: format, encode (x264 CRF ≤ 12), read scale, duration, frames, sheet, presence, speech (whisper WER ≤ 8%), loudness (−16 LUFS ± 2 in essay mode), PII scan run or reported skipped. A failing check was fixed at its cause (a wrong region, a mistimed beat, a clipped card).
- `Out/review/` holds the studio pass, one look each before anyone scrubs the file: `contact-sheet.png` (a timestamped frame every 5 s), `motion-strip.png` (8 frames across every beat, one row per beat, so a static beat or a clipped entrance shows as a flat or broken row), `waveform.png`, `spectrogram.png`.
- No beat shows a 404, a cookie wall or a blank tile: a contact sheet of the run's `Assets/*.png` was checked before build and any bad capture re-captured or its beat re-elected.
- Every frame in `Out/frames/*.png` (one per beat plus chapter cards) shows one focal movement, text still while it is read, and nothing template-shaped, and `presence-pause-crop.png` and `presence-speech-crop.png` differ visibly.
- Music exists only when the run asks for it and only where nobody is talking over it: `Score.json` is the score as code (tempo, tracks, clips, notes), synthesized in-process to `Narration/score.wav` and ducked under the voice into `Narration/bed.wav`; the composition plays the bed when it exists. Off by default; `--music ambient|pulse` generates a score sized to the timeline with a hit at every chapter.
- `Out/thumbnail.png` is in the agent house style with its accent-colour border verified; `Out/thumbnail-320.png` read at YouTube size shows the title reading, the avatar as a cutout, and the border in the accent; `Out/description.md` carries real chapter times.
- The upload thumbnail is `Out/thumbnail.jpg`, a JPEG of at most 2 MB, made and checked per the Tool contract.
- No stage waits on work it does not read: the captures are taken while the narration and score are made, the render starts once narration, score and captures all exist, and the thumbnail is rendered and verified while the video is verified. The description is the one exception: it is written only after the video verifies, so a failed run never leaves a fresh one. Once any stage has failed no other stage starts, and the run output names the failed stage, every stage left unrun, and that nothing in `Out/` is deliverable.
- The thumbnail's critique may run beside the video's, but nothing is delivered to `~/Downloads/` until `Out/verify.json` passes: a run whose video fails verify delivers no thumbnail.
- `Out/pii.json` findings, if any, are listed for the user; with no PII scanner configured, the report says the scan was skipped and the frames were looked through by eye.
- The run lives in the runs root (`Config.json` `runsRoot`), never inside a git repo; `~/Downloads/<slug>/` holds the delivered `essay.mp4` and `thumbnail.jpg` (each critiqued and delivered per the Tool contract), plus copies of `description.md` and `Essay.md`.
- Watched muted, the render cannot be told apart from hand-made work: nothing in it reads as a template.

## Anti-criteria

- A failing check is never fixed by loosening the threshold.
- PII findings never auto-fail the run.
- Frames are never trusted unread.
- Nothing is published from this skill: the run ends in review state, and publishing (private first) is the user's separate call with the upload tool of their choice, after they confirm the exact action.
- No image or video reaches `~/Downloads/` except through the hand-over in `../SKILL.md` § Quality loop (the `art-direction` skill's `Deliver.ts`) after a passing critique on those exact bytes.
- Never claims the ear check on pronunciation; that check is the user's, and the report says so.

## Tool contract

```bash
bun Tools/Setup.ts --check          # first time on a machine: without --check
bun Tools/Run.ts --run <slug>       # lint, then narrate → score beside capture, then build, then verify beside thumbnail, then describe
bun Tools/Run.ts --run <slug> --music ambient   # same, with a generated score ducked under the voice (or hand-write Score.json)
bun Tools/Run.ts --run <slug> --from build   # after a composition change
bun Tools/Run.ts --run <slug> --from narrate # after a narration edit (only changed beats re-synthesize)
```

Render and whisper are CPU-heavy: run `Run.ts` in the background and read its output when it finishes. Render time grows with the essay's length.

- The upload thumbnail is a JPEG of at most 2 MB, written by `Tools/Thumbnail.ts` beside the PNG (q85, 4:4:4 chroma; it refuses a JPEG over 2 MB, the YouTube limit). A thumbnail that fails its checks is fixed, never skipped (2026-10-25).
- `essay.mp4` and `thumbnail.jpg` are delivered per `../SKILL.md` § Quality loop: the `art-direction` skill's `Critique.ts --video <run>/Out/essay.mp4 --brief <Brief.json> --out <run>` and `Critique.ts --image <run>/Out/thumbnail.jpg --brief <Brief.json> --out <run>/Out/thumbnail.critique` (separate folders, so neither overwrites the other's `Critique.json`), then its `Deliver.ts --artifact <file> --critique <its Critique.json> --to ~/Downloads/<slug>/`. `description.md` and `Essay.md` are copied.

## Gotchas

Names in the narration are respelled in `<run>/pronunciations.json` (the user's `$AGENT_SKILLS_HOME/video-essay/PRONUNCIATIONS.json`, when present, applies automatically). The whisper transcript in `Out/whisper/` is the proxy check: a name that comes back spelled correctly was said recognizably. An ear check is still the user's; say so in the report rather than claiming it.
