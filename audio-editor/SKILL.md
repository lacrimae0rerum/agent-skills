---
name: audio-editor
description: "Cleans spoken audio via Whisper transcription, LLM segment classification, and ffmpeg cuts, plus breath taming, loudness locking and noise-gate artifact repair. USE WHEN clean audio, edit audio, remove filler words, clean podcast, remove ums, cut dead air, polish audio, trim recording, cut stutters, ticking audio, clicking audio, audio clicks, gate artifacts, popping audio, loud breaths, breathing sounds, mouth sounds, mouth clicks, lip smacks, tame the breaths, normalize loudness to -14 LUFS. NOT FOR video composition (use `hyperframes`) or tight-cutting a podcast or spoken recording for publishing."
license: MIT (see LICENSE.txt)
compatibility: "Requires bun 1.2+, ffmpeg and ffprobe, and insanely-fast-whisper (MPS, Apple Silicon) or openai-whisper on PATH. Analyze needs an LLM: ANTHROPIC_API_KEY, OPENAI_API_KEY, the claude or codex CLI, or AGENT_SKILLS_LLM_CMD. Optional CLEANVOICE_API_KEY for the cloud polish step."
---

# Audio Editor

Cleans recorded audio automatically: strips filler words, false starts, stutters, spoken edit markers and dead air, and crossfades every cut. Transcribe gets word-level timestamps from Whisper (insanely-fast-whisper on MPS), Analyze has an LLM classify each segment (KEEP, CUT_FILLER, CUT_FALSE_START, CUT_EDIT_MARKER, CUT_STUTTER, CUT_DEAD_AIR), telling rhetorical emphasis apart from accidental repetition, and Edit executes the cuts with ffmpeg using 40ms qsin crossfades at every edit point and extracted room tone to fill gaps. An optional Cleanvoice pass removes mouth sounds and remaining fillers and normalizes loudness. Output is cleaned MP3/WAV. Modes: --preview, --aggressive, --polish. BreathTame, LoudnessLock, GateScan and GateRepair handle breaths, delivery loudness and noise-gate ticks on their own.

## Ideal State

- Every output keeps what the speaker meant, their deliberate pauses and natural breathing included, and no edit can be heard.
- Done means heard: a clean scan or a zero exit code never counts on its own.
- Repairs are minimal-touch: each tool changes only the defect it targets and leaves the rest of the audio alone.
- Nothing is changed or uploaded without the user's say: previews modify nothing, ambiguous file matches are asked about, and cloud polish runs only on request.

## Intent Routing

| Intent | Trigger | File |
|--------|---------|------|
| **Clean** | "clean audio", "edit audio", "remove filler words", "clean podcast", "remove ums", "cut dead air", "polish audio" | `Intents/Clean.md` |

Standalone breath, mouth-click, gate-tick and loudness requests ("ticking audio", "gate artifacts", "loud breaths", "mouth clicks", "tame the breaths") also route to Clean, using the Tools table and Gate Artifacts below.

| File | Read when |
|------|-----------|
| `Tools/` | each tool's `<Name>.help.md` holds its full flags and exit codes |
| `Setup.md` | first-time setup: ffmpeg and Whisper to install, the optional Cleanvoice key, and a synthesized-tone proof |

## Data & Config

User preferences, when present, live in `$AGENT_SKILLS_HOME/audio-editor/PREFERENCES.md` (default `~/.agent-skills/audio-editor/`) and override the defaults here; when absent, the defaults stand. First-time setup (installs, the optional key, a proof it works) is in [Setup.md](Setup.md).

## Setup

- Install `ffmpeg` (with `ffprobe`) and a Whisper CLI: `insanely-fast-whisper` (fast on Apple Silicon MPS) or `openai-whisper`. Details in [Setup.md](Setup.md).
- Analyze needs an LLM provider: `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`, a logged-in `claude` or `codex` CLI, or `AGENT_SKILLS_LLM_CMD` (any command that reads a prompt on stdin).
- Optional: `CLEANVOICE_API_KEY` for the cloud polish step. Put keys in the environment or in `$AGENT_SKILLS_HOME/.env`.

## Tools

Run the commands from the skill folder.

| Tool | Command | Purpose |
|------|---------|---------|
| **Transcribe** | `bun Tools/Transcribe.ts <file>` | Word-level transcription via Whisper |
| **Analyze** | `bun Tools/Analyze.ts <transcript.json>` | LLM-powered edit classification |
| **Edit** | `bun Tools/Edit.ts <file> <edits.json>` | Execute cuts with crossfades + room tone |
| **Polish** | `bun Tools/Polish.ts <file>` | Cleanvoice API cloud polish |
| **Pipeline** | `bun Tools/Pipeline.ts <file> [--polish]` | Full end-to-end pipeline |
| **GateScan** | `bun Tools/GateScan.ts <file> [--json]` | Detect noise-gate ticking (silence-boundary steps); exit 1 on defects |
| **GateRepair** | `bun Tools/GateRepair.ts <in> <out.mp4> --finalize [--abr 192k]` | Repair gate ticking; --finalize iterates until the encoded file scans clean |
| **BreathTame** | `bun Tools/BreathTame.ts <file> [--dry-run] [--json]` | Attenuate individual breath/mouth-click events in word gaps; word-confined, ducks never removes, proves bit-identity outside events |
| **LoudnessLock** | `bun Tools/LoudnessLock.ts <in> [--out <out.mp4>]` | Measure or lock delivery loudness to −14 LUFS / −1dBTP (YouTube standard); self re-measures, exit 0 only in tolerance |

## Gate Artifacts

Gate checks run only when someone actually reports ticking or clicking; routine per-export scans were retired 2026-07-15. On a report: `GateScan` the file to confirm (sample-domain steps, exit 1 on defects), then `GateRepair --finalize` to fix. Repair before leveling when possible, and scan the final encode, not the intermediate WAV. If a RAW recording scans dirty, a capture-chain gate is back on; surface it.

## API Keys Required

| Service | Env Var | Where to Get |
|---------|---------|-------------|
| Cleanvoice (for polish step, optional) | `CLEANVOICE_API_KEY` | cleanvoice.ai Dashboard Settings API Key |

## Gotchas

- **Cloud polish uploads audio to an external service.** Before any Polish run or `--polish` flag, confirm the exact file and the upload with the user, and ask again for sensitive content.
- **Capture-chain noise gates cause the ticks.** Recorder filters and macOS Voice Isolation truncate audio to digital zero with no fade, and leveling amplifies each edge into an audible tick. The class is fixed at capture: remove any noise-gate filter from the recorder's mic chain. (2026-07-13: hundreds of gate edges in one recording reached published audio.)
- **AAC re-introduces steps near silence.** An intermediate WAV that scans clean says nothing about the encoded file, which is why GateScan runs on the final encode. (2026-07-13)
- **dB-domain cliff detectors false-positive on fade feet.** A legitimate cosine fade into digital zero has infinite dB slope at its foot, so any >NdB/2ms detector flags it forever. Verify repairs with sample-domain STEP detection (GateScan), never dB slopes. (2026-07-13)
- **One-sided iterative fades don't converge on stray boundary impulses.** A single sample sitting on a gate boundary survives repeated one-sided fades; fade-down-then-up "mutes" preserve a blip's edges and its leading step. The V-notch (cosine to zero at the boundary, both sides) and hard-zeroing inside gated silence are the converging fixes. (2026-07-13)
- **Meter-clean ≠ ear-clean.** Scanners find ticks; repairs can create audible holes the tick-scanner calls clean (the 2026-07-12 duck incident). Match the probe to the defect class a human hears, keep repairs minimal-touch, and give the user before/after listen clips at swap time.

## Examples

- **"clean up the audio on this podcast file"** → Clean, full pipeline (transcribe → analyze → edit) → cleaned MP3 with filler words, stutters, and dead air removed.
- **"show me what edits you'd make to this recording"** → Clean with `--preview` → proposed edit list, audio untouched; the user reviews, then runs again to apply.
- **"aggressively clean this audio and polish it"** → Clean with `--aggressive --polish` → tighter filler thresholds, then the Cleanvoice pass for mouth sounds and normalization.
