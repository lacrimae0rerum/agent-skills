# HyperFrames seam

The one path every HyperFrames render goes through. Each skill that renders video (hyperframes, art's animated diagrams, and any other video skill) carries its own byte-identical copy of this folder in `Tools/lib/hyperframes/`, so no skill reaches into another. It runs a pinned HyperFrames CLI (`HYPERFRAMES_VERSION` in `constants.ts`, currently 0.8.71) through `bun x`, sandboxed so nothing leaves the machine, and it refuses to hand back a video it has not checked.

Requirements: bun 1.2+, ffmpeg and ffprobe on PATH, macOS (the render-time network sandbox is `sandbox-exec`). GSAP and the extracted bundled fonts are cached under `$HYPERFRAMES_CACHE` (default `~/.cache/agent-skills/hyperframes`), the pinned CLI in bun's install cache, and its headless Chrome where the CLI keeps it; every copy shares them, so one `install` serves all. Optional house type roles: `$AGENT_SKILLS_HOME/hyperframes/TypeRoles.json` (default `~/.agent-skills/hyperframes/`).


## Library

The import path below is relative to this folder; from the skill root the module is `Tools/lib/hyperframes/HyperFrames.ts`.

```ts
import { render, snapshot, check, audioBands, embedFonts, injectFonts, registerAfterFonts, stageGsap } from "./HyperFrames.ts";

await stageGsap(projectDir);                          // copies pinned GSAP to <project>/vendor/gsap.min.js
await render({ projectDir, out: "out/video.mp4", fps: 30, workers: 1, quality: "standard", variables, expectAudio: true });
await snapshot({ projectDir, times: [0, 4.2], outDir: "stills" });
const { ok, findings } = await check({ projectDir });
const bands = await audioBands({ wav: "narration.wav", fps: 30, out: "bands.json" });
```

Every failure throws `HyperFramesError` with a `stage` (`input`, `check`, `probe`, `render`, `strip`, `validate`, `snapshot`), the findings, and the render log tail.

## CLI

```bash
bun HyperFrames.ts render   --project <dir> --out <file.mp4|webm|mov> [--fps 30] [--workers 1] [--quality standard] [--variables vars.json] [--still] [--audio] [--skip-check] [--no-contrast] [--log render.log] [--gpu auto|hardware|software]
bun HyperFrames.ts snapshot --project <dir> --at 0,1.5 --out-dir <dir> [--gpu auto|hardware|software]
bun HyperFrames.ts check    --project <dir> [--no-contrast] [--gpu auto|hardware|software]
bun HyperFrames.ts bands    --wav narration.wav --fps 30 --out bands.json [--bands 8] [--spectrum 32]
bun HyperFrames.ts stage-gsap --project <dir>
bun HyperFrames.ts install
```

Exit codes: 0 done, 1 the work failed, 2 usage error.

## What `render` does, in order

1. **Input.** Reads the root's `data-width`, `data-height`, `data-duration` and `data-fps`. A root without a duration needs `durationSec`, because the output cannot be validated otherwise.
2. **check()** (skippable with `skipCheck` when the caller just ran it):
   - Our static preflight runs first (below).
   - Then `hyperframes lint --json`, then `hyperframes check --json`.
   - Any error fails the check. Three warning kinds are promoted to errors: `GSAP target … not found`, failed resource loads, and `net::ERR_*`.
3. **Probe.** The composition opens in the pinned headless Chrome over DevTools, sandboxed, and `window.__timelines` is read. It fails in seconds on any of these:
   - an unregistered id or a non-GSAP value;
   - zero duration when motion is expected;
   - a tween whose selector matched nothing;
   - a page error;
   - a font face that did not load.
4. **GPU canary.** Picks hardware or SwiftShader for every HyperFrames Chrome (check, render, snapshot). See § GPU.
5. **Render.** `hyperframes render --no-best-effort --strict` into a hidden raw file. `--no-best-effort` turns HyperFrames' own `sub_timeline_readiness_timeout` into a failure. That covers nested compositions (`data-composition-src`), which the probe cannot see.
6. **Strip.** A stream-copy remux with `-map_metadata -1` and bitexact flags. It removes HyperFrames' `hyperframes_renderer` and `hyperframes_version` container tags, and the Lavf encoder tag with them.
7. **Validate.** ffprobe checks codec, size, fps, packet-counted frame count (±1), duration, and no surviving provenance keys. With `expectAudio`, the file must have an audio stream that is not silent (max > −60 dB).
8. **Blank frames.** 12 frames from the first to the last are decoded at 160×90 gray, for every render, still or not. A frame is flat when fewer than 0.1% of its pixels sit more than 6 levels from its mean. If every sample is flat, the render fails with `blank-frames` and the file is moved to `<name>.rejected.<ext>`.
9. **Motion.** With `expectMotion` (the default), 12 frames from the first to the last are decoded at 160×90 gray. At least one pair must differ in 0.1% of pixels by more than 6 levels. A still render is moved to `<name>.rejected.<ext>`, so no caller can ship it.

`snapshot` runs preflight, the probe (with `expectMotion: false`, so `data-no-timeline` thumbnails pass), and `hyperframes snapshot --no-end --describe false`. It then checks there is one PNG per time, each at the composition's size. A fully transparent still (`transparent-frame`), or a set where every still is one flat colour (`blank-frames`), fails the call, and those PNGs are renamed `rejected-<name>.png`.

## GPU: a canary before any Chrome frame is trusted

On 2026-09-24 every render and snapshot on one Mac came out black, including a project that had rendered correctly two hours earlier. The cause was the GPU, not the seam or the compositions. From 18:26 the kernel logged `IOGPUSysMemory::retainCPUWireMapping … failed to map memory for CPU wire mapping` and `AGXk: map block failed for cpu` on every composited frame. Hardware (ANGLE Metal) compositing in headless Chrome then returned fully transparent screenshots (RGBA 0,0,0,0). That reproduced outside the seam and outside the sandbox, with a plain CDP screenshot of a one-box page. The same page under SwiftShader rendered correctly. Killing every stray `chrome-headless-shell` did not clear it.

HyperFrames did not notice. Its own GPU probe reads only the WebGL renderer string, which still said "ANGLE Metal Renderer: Apple <chip>", so it chose hardware and exited 0. `hyperframes check` also drives Chrome in that mode, and it crashed or hung with `Page.captureScreenshot: Target closed`.

The seam now asks the GPU directly. `gpu.ts` opens a one-colour page (rgb 255,0,128) in the pinned Chrome, sandboxed, with HyperFrames' own macOS hardware flags. It takes one DevTools screenshot and requires 98% of pixels to be that colour, fully opaque. The answer is cached per process.

- `gpu: "auto"` (default): hardware when the canary passes, SwiftShader when it fails. The fallback prints one `[hyperframes:gpu]` line and is recorded in `result.gpu` and the render log's first line.
- `gpu: "hardware"`: a failed canary fails the call at the `probe` stage with code `gpu-canary`.
- `gpu: "software"`: SwiftShader, no canary.

The mode reaches HyperFrames as `PRODUCER_BROWSER_GPU_MODE`, so `extraEnv` may not set that key. SwiftShader is correct for DOM and CSS compositions. WebGL-heavy compositions run slower under it.

Blank-frame checks back the canary up. A GPU that fails some other way still cannot ship a black video or a transparent still.

The earlier session also left headless Chrome trees running under launchd for hours. `runProcess` now kills the child's whole process tree on a timeout. A HyperFrames process that exits by itself can still leave its browser behind; that case is not handled here.

## Network: what we found and how it is blocked

Telemetry off is not enough. In 0.8.71 a render reaches the network in four ways:

| Path | When it happens | What leaves the machine | Our control |
|---|---|---|---|
| PostHog telemetry, npm update check, skills registry | every command | usage and machine shape | `HYPERFRAMES_NO_TELEMETRY`, `DO_NOT_TRACK`, `HYPERFRAMES_NO_UPDATE_CHECK`, `HYPERFRAMES_SKIP_SKILLS`, `HYPERFRAMES_NO_AUTO_INSTALL`, `CI` (no feedback prompt) |
| Google Fonts | compile, for any `font-family` without an `@font-face` | the family name, plus a `text=` parameter holding every character on the page | preflight `font-not-embedded`; embed with `embedFonts()` |
| CDN `<script src>` inlining | compile, for any http(s) script | the request | preflight `remote-url`; load GSAP from `stageGsap()` |
| Gemini vision | `snapshot` by default whenever `GEMINI_API_KEY` or `GOOGLE_API_KEY` is set | every snapshot frame | the env is an allowlist with no keys, `--describe false` is always appended, and callers cannot pass `--describe` |

The hard stop sits under all of those. Every render-time process runs under `sandbox-exec` with a Seatbelt profile. It denies outbound IP except loopback, and it denies the mDNSResponder socket, so DNS fails too. The CLI serves the project to its Chrome on 127.0.0.1, so loopback must stay open.

The rule order in that profile matters. With the DNS deny after the loopback allow, loopback connects failed with EPERM, so the DNS deny comes first. A unit test proves `curl https://example.com` fails inside the sandbox, and every render test runs inside it.

I verified that renders succeed with the network blocked. I did not list each connection attempt the CLI makes; the sandbox refuses them without logging.

Provisioning is the only step that reaches the network: the pinned CLI from npm, `chrome-headless-shell` from Chrome for Testing, and GSAP from npm, checked against a pinned sha256. `ensureInstalled()` first tries the cached copy offline. It reaches the network only when that copy is missing; macOS clears `$TMPDIR/bunx-*` after about three days unused.

The sandbox is macOS only. On other platforms the seam throws instead of rendering unguarded. No Linux path is built or verified.

The probe's Chrome runs with `--no-sandbox`. Chrome's own sandbox cannot start inside `sandbox-exec`: with it on, renderers hung and `Runtime.enable` never answered. The Seatbelt profile is the boundary instead, and the probe only ever loads our own local file.

## Contract for the per-skill ports

- **Composition.** `index.html` has a root with `data-composition-id`, `data-width`, `data-height`, and `data-duration`. Give the root `data-fps` or pass `fps`.
- **One paused GSAP timeline per composition**, registered as `window.__timelines[<data-composition-id>]`. A composition that is deliberately timeline-free (a thumbnail) sets `data-no-timeline` and renders with `expectMotion: false`, or goes through `snapshot`.
- **Everything is local.**
  - GSAP comes from `stageGsap(projectDir)` as `./vendor/gsap.min.js`.
  - Images, video, audio and fonts are project files or data URIs.
  - `vendor/`, `node_modules/`, `renders/` and `snapshots/` are not scanned by preflight. Never put authored code there.
- **Fonts.**
  - Never start a font stack with a generic family. The pinned compiler prepends Inter to any such stack (and any `--*` custom property holding one) on the render path only, so snapshots keep the generic face while the MP4 is set in Inter (measured 2026-10-24, cli.js normalizeSystemFontPrimaryFamilies). Preflight `font-generic-primary` refuses a mono or serif generic first and warns on sans.
  - `roleFaces(role)` gives any composition a real face: the user's house roles from `TypeRoles.json` (with the role's case), or, without them, the compiler's own bundled OFL face (JetBrains Mono for `code`, Inter otherwise) extracted from the pinned package on disk to the seam cache. `bundledFaces(pkg, family, weights)` reaches any other embedded face (EB Garamond, IBM Plex Mono…). Nothing is fetched.
  - Build the faces from the skill's user config (in `$AGENT_SKILLS_HOME/<skill>/`). A font-families file uses `facesFromFamilies(CardFonts.json)`; a role map uses `facesFromRoles(Config.json.fonts, role => …)`.
  - `embedFonts()` validates every face and throws `FontEmbedError` naming each missing or non-font file. `injectFonts(html, fonts)` inserts the faces and the gate.
  - End the timeline script with `registerAfterFonts(id, "tl")` instead of a direct assignment. The timeline then registers only after every face has loaded, and HyperFrames captures nothing before registration.
  - A face that fails to load leaves the timeline unregistered, and the probe reports `font-load`. `document.fonts.ready` alone is not enough, because it ignores faces not yet used in layout.
- **Audio features.**
  - Precompute with `audioBands()`, then ship them as `<script src="bands.js">` built with `audioBandsScript()`, before the timeline script.
  - Never decode audio in the page.
  - Frame `i` is audio time `i/fps` of the file; add the composition offset yourself.
- **Variables.** Pass them to `render({ variables })`. They go through `--variables-file` with `--strict-variables`, and the probe shims `window.__hyperframes.getVariables()` with the same values.
- **Workers.** The default is `autoWorkers(duration)`: 1 under 20 s (see measurements), otherwise a third of the cores capped at 8, with `HF_CAPTURE_PARALLEL_STREAM` on. Frame ranges are captured across the workers and stitched into one encode. Every video skill that vendors this seam renders through it, so this one default is how they all parallelize. A caller may still pass `workers` to pin a count.
- **Capture.** `render()` forces screenshot capture by default (§ Capture modes). Opt out only with `extraEnv: { PRODUCER_FORCE_SCREENSHOT: "false" }` and a proven frame-parity check under load.

## Gotchas (from the HyperFrames docs, enforced where a rule can see them)

- **CSS `transition` is not seek-safe.** It animates in wall time, so seeked frames land mid-transition or skip it. Preflight `css-transition` refuses it (`transition: none` is fine). Animate with GSAP.
- **`z-index: -1` clips do not render.** The element drops behind the clip's stacking context. Preflight `negative-z-index` refuses it.
- **A trimmed `<video>` needs `data-media-start`.** The audio mixer reads only `data-media-start`, so a video with only `data-playback-start` plays trimmed picture over untrimmed sound. Preflight `video-trim-attr` refuses it. Nested composition hosts use `data-playback-start`.
- **No `Date.now`, `new Date()`, `performance.now`, `requestAnimationFrame`, unseeded `Math.random`, `setInterval`, or network APIs** in composition code. Frames are seeked, never played. Preflight refuses each one; use a seeded PRNG.
- **On macOS, parallel capture spools to disk.** More than one worker switches capture from streaming draw-element to screenshots, which are written to disk and then encoded. `HF_CAPTURE_PARALLEL_STREAM=true` makes multi-worker capture stream as well; HyperFrames still calls that path opt-in.
- Do not call `play()`, `pause()` or set `currentTime` on media. Put a `<video>` inside a wrapper and animate the wrapper.
- A `console.warn("GSAP target #x not found")` is only a warning to HyperFrames. The seam treats it as an error, because the tween moves nothing.

## Presence badges: mapping from Remotion

`audioBands()` emits three lanes per frame:

- `rms`: linear, full scale 1.
- `bands`: N log-spaced bands from 40 Hz to 16 kHz (default 8), each normalised 0–1 by its own peak over the file. This is the port of HyperFrames' `extract-audio-data.py`.
- `spectrum`: the lane the badges use. It reproduces `@remotion/media-utils` 4.0.525 `visualizeAudio({ numberOfSamples: 32, smoothing: true })` over `useWindowedAudioData({ windowInSeconds: 10 })`:
  - channel 0 at the native rate;
  - Int16 truncation and a 64-point FFT;
  - Remotion's three-pass smoothing, ported verbatim including its in-place pass reuse;
  - normalisation by the peak of the previous, current and next 10 s windows;
  - averaging of frames f−1, f and f+1.

The core per-frame math matches Remotion's own `getVisualization` to 1e-9 (the `Remotion parity` test runs it against the cached package). The 10 s window peak is ported from reading `use-windowed-audio-data.js`. It is not parity-tested, because that hook needs React.

How Presence.tsx maps. `S = bands.spectrum.values[frame]`, where `frame` counts from the narration's start, as `useCurrentFrame()` did inside its Sequence:

- **Essay presence (9 bars):** `level[i] = min(1, S[1 + round(|i − 4| / 4 × 12)] × 9)`. Unchanged.
- **Voice badges:** `stripLevels(S, bars, 4)` is a pure function over the same array. Move it into the port as is. The BadgeB meters stay derived from `stripLevels(S, 10, 4)`.
- **Silence:** a fully silent 30 s neighbourhood made Remotion divide by zero, giving NaN levels. The seam emits 0, which gives flat bars.

## Capture modes: drawelement drops frames under load

With one worker HyperFrames captures by streaming draw-element. On a loaded machine that path ships **stale frames**: a captured frame shows the page as it was a few frames earlier, the render exits 0, and every seam check passes, because the file is valid and it moves. Measured 2026-09-24 during a card-render port: six simultaneous 8 s renders of one card on a heavily loaded machine. Per-frame SSIM against the Remotion baseline found stale frames in 5 of 6 renders (worst frame SSIM 0.81). With `PRODUCER_FORCE_SCREENSHOT=true` the same six renders had 0 stale frames, and the wall time was about the same (20.9 s against 17.7 s). A render alone on an idle machine showed no stale frames in either mode.

Pass the switch per render with `render({ extraEnv: { PRODUCER_FORCE_SCREENSHOT: "true" } })`. `extraEnv` accepts `HF_*` and `PRODUCER_*` keys only and reaches only the render process. Since 2026-09-24 it is the seam default for every consumer, because a stale frame passes every check the seam has. `{ PRODUCER_FORCE_SCREENSHOT: "false" }` opts back into draw-element.

## Workers on a 24-core Apple Silicon Mac

These numbers are from 2026-09-24. The composition was 1080p30, 10 s, 24 animated rounded boxes with shadows. It was rendered sandboxed at `standard` quality through `render()`, one run per setting; the one-off benchmark script was not kept, so rerun by rendering any comparable composition with each setting. "Disk" is the drop in free space on the temp volume sampled every 200 ms. Other sessions were writing to the same disk, so treat it as approximate.

| Workers | Capture | Streaming | HyperFrames render time | Wall time | Peak disk |
|---|---|---|---|---|---|
| 1 | drawelement | yes | 8.6 s | 10.5 s | ~17 MB |
| 2 | screenshot | no (spools to disk) | 10.9 s | 13.0 s | ~54 MB |
| 2, `HF_CAPTURE_PARALLEL_STREAM=true` | screenshot | yes | 9.3 s | 11.1 s | ~21 MB |
| 4 | screenshot | no (spools to disk) | 7.3 s | 9.1 s | ~65 MB |
| 4, `HF_CAPTURE_PARALLEL_STREAM=true` | screenshot | yes | 6.9 s | 8.7 s | ~12 MB |

Two workers are slower than one: leaving draw-element capture costs more than the second Chrome gains. Four workers are about 15% faster. At this length the spool is tens of MB of screenshots, not the 25 GB per minute raw-RGBA figure the docs give for the disk path.

Since 2026-10-16 the default is `autoWorkers` (§ Workers above): short renders keep 1, long ones split. The seam passes `extraEnv` only for `HF_*` and `PRODUCER_*` switches.

## Files

- `HyperFrames.ts`: render, snapshot, check, and the CLI.
- `run.ts`: bounded processes, the sandbox, the pinned invocation, and provisioning (CLI, Chrome, GSAP).
- `env.ts`: the allowlisted env and the argument rules.
- `constants.ts`: pinned versions.
- `preflight.ts`: the static rules.
- `probe.ts`: the DevTools timeline probe.
- `media.ts`: provenance strip, ffprobe validation, the motion check, and the blank-frame checks.
- `gpu.ts`: the GPU canary and the mode decision.
- `audio.ts`: audio bands.
- `fonts.ts`: font embedding, the gate, `roleFaces` and `bundledFaces`.
- `boundary.ts`: `confinedPath` and `atomicWrite`, used to stage GSAP into a project safely.

No test suite or fixtures are included. Verify a copy by rendering a small composition (`Scaffold.ts`, then `check` and `snapshot`) on the target machine.
