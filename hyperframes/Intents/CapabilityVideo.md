# CapabilityVideo

A 15–30 s narrated announcement film for one capability we just added ("you can now do X"), built on LaunchVideo's release-film pipeline at a single feature's scope: a synthetic narration voice, a music bed, the real feature on screen, checked and delivered the same session.

## Ideal State

- **One capability, stated as one sentence before anything is built.** `BRIEF.md` names the capability as "You can now …", who it is for, how to reach it (the command, page or phrase), and its proof: the commit, the passing acceptance criterion or the command output that shows it works. When the user says only "make a video" after we built something, the capability is the thing this conversation just built, read from its diff, spec or commit, never from memory.
- **It is a release film for one feature.** Every criterion in `Intents/LaunchVideo.md` for a release film binds here, from the shot list and asset checks to the shot-match check, the layout gates, FilmStats and the critique, except the release-scale line, which a single capability does not carry.
- **Short and narrated.** The master runs 15–30 s. The voice sets the length: a script of about 40–75 words in the narration voice (`FISH_VOICE_ID`) from `Tools/lib/fish-tts.ts`, with word timestamps from the client. A music bed sits under it, ducked so the narration stays at least 15 dB above the music wherever a word is spoken, and every picture change lands on its spoken word.
- **Hook, proof, reach.** The first 3 s say what you can now do. The middle shows the capability working: its own real screen, its own command transcript, or a designed scene of its mechanism, in 3–6 shots. The last shot says how to reach it, with the command, page or phrase on screen.
- **It looks like the product without a new direction pick.** A capability reuses its product's last approved release-film direction (palette and fonts read from the product's own files, the synthetic install, the motion system), named in the user's `PREFERENCES.md` § Capability films, so no animatics are made. With none on record, LaunchVideo's animatic pick runs first.
- **The user sees the script before the voice.** The script and shot list go to the user in one message, and the build proceeds unless redirected (LaunchVideo safety gate 3).
- **Fast.** The first checked cut reaches the user within about 30 minutes of the ask, with that ETA said up front; a change comes back through LaunchVideo's recut path in 5–15 minutes. The agent builds it inline as the one author.
- **Every output ships.** The 16:9 master with burned-in captions, a poster frame and a 9:16 vertical cut, each passed the quality loop (SKILL.md § Quality loop) at the house bar and reached `${AGENT_SKILLS_OUTPUT_DIR:-$HOME/Downloads}` through it, and, where a file-sharing tool is installed, went on a share link (after the user confirms the upload) that is given in the answer.
- **It passed the final checks.** The master rendered through the seam with every stage green, the final proof check and the shot-match check passed on it, and the answer carries those results beside the other check results.

## Anti-criteria

- No film covers more than one capability. Two features are two films, or a release film.
- No spoken or on-screen claim goes beyond the brief's proof: if the code does not do it yet, the film does not say it.
- No shot borrows another feature's screen, and no private data, real identity or private path appears in any frame (a private-data scan of the script, captures and stills reports zero hits).
- No parallel segment builders and no new film pipeline: the film runs on LaunchVideo's tools and the release-video project, and agents at most capture assets.
- No cut reaches the user before the shot-match check, the layout gates and the critique have run, unless the user asks to see it early, and then every failing check is named with it.
- Nothing is posted or published. Posting the film is a separate ask (the `broadcast` skill or another posting tool, if installed), and the exact post is confirmed with the user first.


## Inputs

- The capability: this conversation's work (diff, commit, acceptance criteria), or what the user names when asking for a capability video.
- The user's `PREFERENCES.md` § Capability films (`$AGENT_SKILLS_HOME/hyperframes/PREFERENCES.md`): the project that holds the approved direction, synthetic install, narration and recut tooling, and where each capability film's folder goes.

## Tool contract

- Everything in `Intents/LaunchVideo.md` § Tool contract, used as for a release film; the plan file is `SHOTLIST.md`.
- Narration: `bun Tools/lib/fish-tts.ts --text-file script.txt --out narration.mp3 --alignment alignment.json`, in the narration voice, with word timestamps.
- Render: the master renders through the seam's `render --audio`, which exits 1 on any failed stage.
- Delivery: the quality loop's hand-over (SKILL.md § Quality loop), then, where a file-sharing tool is installed and the user confirms the upload, a share link.

## Output format

The answer opens with the share link (or the Downloads path when no sharing skill is installed) and the film's length, then the one-sentence capability, then the ready caption line disclosing that the narration is a synthetic voice (LaunchVideo's disclosure rule), then the check results: shot match, gates L and Q, FilmStats row, critique median, private-data scan.

## Examples

```
User: "we just added Linux support for the installer — make a capability video"
→ BRIEF.md: "You can now install the app on Linux", proof = the installer commit and its CI run
→ 55-word script and a 5-shot SHOTLIST.md sent; build continues
→ narration voice + ducked bed, release direction reused, checks pass
→ 24 s master, 9:16 cut and poster delivered, share link in the answer
```
