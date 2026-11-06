# Tournament.ts

A single-elimination bracket over an injected pairwise judge. Every pair is judged twice with the order flipped (a winner that flips with the order is position bias and counts as a tie); the bracket runs again on shuffled seeding, and a different winner reports the result unstable. The result records the generator and judge model ids and flags a same-family pair.

```
bun Tournament.ts --candidates a.png,b.png,c.png --question "..." [--generator <model-id>] [--calibration <set.yaml>] [--concurrency N] [--json] [--allow-identity] [--public] [--no-rerun]
```

Image candidates ride `VisionJudge.ts pairwise` (Gemini, which receives only public material: pass `--public` to say the images are public, otherwise a private-image bracket is refused). Every image path passes the vision identity guard: a path matching `headshot` is refused without `--allow-identity`. Text candidates ride `Judge.ts judgeTextPairwise` (the inference path). Exit 0 stable winner · 1 unstable or every pair tied · 2 verifier unavailable (defer, never a red). A `pairwise` row in a spec's Test Strategy runs this command, after the criterion's asserts pass, never on a fast or blocking lane.

`--concurrency N` bounds simultaneous judge requests across the seeded bracket and its shuffled rerun; it defaults to 8. Bracket rounds remain sequential, but independent pairs and the two brackets run concurrently.
