# GeneratedContentVideo Intent

End-to-end generated video: a topic or a piece of content becomes a narrated short with AI scene imagery, captions, and motion, composed and rendered on HyperFrames.

## Ideal State

- A `MeaningMap.json` and a `Direction.json` whose review passed exist before any script, image or narration is made, and every scene image and on-screen line traces to a Direction beat's rationale.
- A 60–250 word narration script, `script.txt`, existed before narration was synthesized: written from the MeaningMap (thesis, claims, arc), in the user's voice (their writing-style notes in `$AGENT_SKILLS_HOME/hyperframes/PREFERENCES.md`, or samples they give) when it goes out under their name, with one paragraph per Direction beat so each beat owns a span of narration.
- Narration is synthesized, its duration drives the composition's `data-duration`, and captions are timed from the TTS alignment, not estimated.
- Once `Direction.json` has passed review and `script.txt` exists, the scene images and the narration are made side by side, since neither needs the other; the scaffold waits for the narration's probed duration, and assembling the composition waits for both.
- The render went through the seam with `--audio`, so a silent or missing track fails validation.
- The delivery hand-off states that the short has synthetic narration and AI-generated imagery and carries a ready caption line disclosing it, because the seam strips the renderer's metadata and adds no AI-content label of its own.
- The final encode rendered through the seam with every stage green, and the agent checked it against this Ideal State and the Anti-criteria (every caption on its word, every scene on its beat) before hand-over.

## Anti-criteria

- No image or narration is generated from a Direction that has not passed review.
- The composition's `data-duration` is never set from the script's word count; it comes from the probed narration length.


## Inputs

Confirm the topic or source, the target platform (vertical 1080x1920 for Shorts/Reels/TikTok, landscape 1920x1080 for YouTube/X), and a length of 30–90 seconds. A narrated explainer of a post, idea or feature for YouTube, at any length, is the `video-essay` skill's `Explainer` intent where installed; this intent is the generated-imagery short.

- `FISH_API_KEY` and `FISH_VOICE_ID` (the Fish Audio reference id of the narration voice), in the environment or `$AGENT_SKILLS_HOME/.env`. The narration tool stops with a message naming any missing variable and never prints a value.
- An image generator: the `art` skill configured for image generation, if installed; otherwise ask the user how scene images should be made, or use images they provide.

## Tool contract

Extract the source the same way as `ContentToAnimation.md` § Inputs (a bare topic becomes a short written brief in `Source/source.md`). Then:

```bash
VM=Tools/lib/video-meaning/VideoMeaning.ts   # paths are relative to the skill folder
bun $VM map    --source Source/source.md --out MeaningMap.json
bun $VM direct --map MeaningMap.json --mode essay --out Direction.json --revise 2 --polish
```

One image per insert beat, prompted from that beat's `visual` spec and the theme, at the composition's aspect:

With the `art` skill, use its image generation tool: prompt `"<beat visual, in the composition's theme palette>"`, model `nano-banana-pro` (or that skill's default), aspect ratio `9:16` for vertical or `16:9` for landscape, output `<project>/assets/scene-<beat>.png`. If that tool asks which intent a call serves, name this one (`GeneratedContentVideo`); check its exact flags in its own help first.

Run the generations concurrently when there are more than three. The generator may write `.jpg` for a requested `.png`; reference the file it actually wrote.

Synthesize with `bun Tools/lib/fish-tts.ts --text-file <project>/script.txt --out <project>/narration.mp3 --alignment <project>/alignment.json` (or `fishSpeakWithTimestamps(text)` from the same file, voice `FISH_VOICE_ID` unless `--voice` names another), so word-level timings come back with the audio; those timings time the captions and the beat spans, and no second speech-to-text pass is needed for a known script. Keep `narration.mp3` (or wav, with `--format wav`) and `alignment.json` in the project. Probe the real duration with ffprobe; it becomes the root's `data-duration`.

Start from `bun Tools/Scaffold.ts --dir <project> --title "<hook line>" --width 1080 --height 1920 --duration <narration s>`, then author:

- `<audio id="narration" src="narration.mp3" data-start="0" data-duration="<s>" data-volume="1">` (the file the synthesis wrote).
- One `<img>` scene clip per insert beat (`class="clip"`, `data-start`/`data-duration` from the beat's narration span), with a slow motivated move (push or drift) rather than a static hold. Use `object-fit: cover` only when the image aspect already matches the frame.
- Captions as clip elements timed from `alignment.json`, a few words per group, tweened on the one paused timeline. Text stays still while it is read.
- Theme variables and eases from `Tools/Theme.ts`. Music only per `References/MusicScore.md`.

```bash
HF=Tools/lib/hyperframes/HyperFrames.ts
bun $HF render --project <project> --out <project>/Out/<slug>.mp4 --audio
```

Then the quality loop (SKILL.md § Quality loop): the `art-direction` skill's critique tool on `<project>/Out/<slug>.mp4` against `<project>/Brief.json` and its delivery tool to `${AGENT_SKILLS_OUTPUT_DIR:-$HOME/Downloads}` when that skill is installed; otherwise the agent's own critique and a copy there.

## Gotchas

- **Image aspect must match the composition.** Generate at 9:16 for vertical and 16:9 for landscape; `cover` hides a mismatch by cropping the subject.
- **Scene images are local project files.** The seam's preflight refuses any remote `src`, and the sandbox blocks the network during render.

## References

`ContentToAnimation.md` animates existing content with typography and diagrams only. This intent also generates the scene images and the narration.
