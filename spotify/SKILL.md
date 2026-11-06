---
name: spotify
description: "Acts on the user's Spotify account via a deterministic CLI (Tools/Spotify.ts): search, playlists, now-playing, library, and playback across devices. USE WHEN spotify, play on spotify, add to my spotify, follow this playlist, save playlist, create a spotify playlist, add tracks, what's playing, my playlists, queue this, skip track, set volume, spotify search, control spotify, my spotify library. NOT FOR music taste or recommendations, generating songs, editing audio (use `audio-editor`)."
compatibility: "Requires bun 1.2+, network access to the Spotify Web API, and a browser for the one-time consent (local callback on 127.0.0.1:8888). Env: SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN (environment or $AGENT_SKILLS_HOME/.env; auth writes them there)."
license: MIT (see LICENSE.txt)
---

# Spotify

Acts on the user's real Spotify account through `Tools/Spotify.ts` — a deterministic CLI that calls the Spotify Web API directly. No MCP, no server process, no session registration: any agent that can run a shell command can invoke it immediately.

```bash
bun Tools/Spotify.ts <command> [flags]   # from the skill folder; --help for the full list
```

## Ideal State

- Every requested account change (follow, playlist build, library read, queue, playback) is one `Tools/Spotify.ts` call keyed by IDs or URIs, and the account state afterwards matches the request.
- Auth is set up once and never repeated by hand: tokens refresh per invocation, and a dead token or redirect mismatch is traced to its real fix (re-run `auth`, or fix the dashboard URI).
- Playback is attempted only on a Premium account with an active device, so a Free account still gets search, playlists and library.

## Intent Routing

| Intent | Trigger | File |
|--------|---------|------|
| **Authorize** | "set up spotify", "authorize spotify", "connect spotify", auth broken | `Intents/Authorize.md` |
| **Manage** | play / search / playlists / queue / library ops | `Intents/Manage.md` |

| File | Read when |
|------|-----------|
| `Setup.md` | first-time install: the developer app, the three credential keys, the proof command |
| `Tools/` | `Spotify.help.md` is the full flag reference (same as `--help`); `EnvText.ts` is the pure env-file helper `Spotify.ts` writes tokens with |

## Data & Config

This skill keeps no config file and no personal data in its folder. User preferences, when present, live in `$AGENT_SKILLS_HOME/spotify/PREFERENCES.md` (default `~/.agent-skills/spotify/`) and override the defaults here; when absent, the defaults stand. Credentials are env-only: `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` and `SPOTIFY_REFRESH_TOKEN`, exported or in `$AGENT_SKILLS_HOME/.env` (default `~/.agent-skills/.env`; names only here, never values). First-time setup, the Spotify developer app and the proof command are in [Setup.md](Setup.md). Tokens auto-refresh per invocation; a missing refresh token means run `Intents/Authorize.md`. With the credentials missing, the tool exits 1 and points at Setup.md.

## Setup

- bun 1.2+; no packages to install (the tool uses `fetch` and bun's built-in HTTP server for the consent callback).
- A Spotify developer app with Redirect URI `http://127.0.0.1:8888/callback`, and its Client ID and Secret.
- `bun Tools/Spotify.ts auth` once (the user clicks **Agree** in the browser); it writes `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` and `SPOTIFY_REFRESH_TOKEN` to `$AGENT_SKILLS_HOME/.env`. Exported env vars win over the file.
- Full walkthrough and proof: [Setup.md](Setup.md).

## Gotchas

- **`search` works before user auth** (client-credentials fallback); every other command needs the refresh token.
- **401 on every call** → the refresh token died (password change, revoked access); re-run `auth` (`Intents/Authorize.md`). The tool persists rotated refresh tokens automatically.
- **`/me/playlists` returns `tracks: null` on playlist rows (observed)** — never assume `tracks.total` exists; the CLI omits the count when absent.

## Examples

- "Add this playlist link to my Spotify" → Manage → the playlist is followed with `follow-playlist --id <ID>` (ID from the URL) and shows in `playlists`.
- "Make me a focus-music playlist and fill it" → Manage → a new playlist from `create-playlist`, holding the tracks `search` resolved, added with `add-tracks`.
- "What's playing?" → Manage → the `now-playing` result.
- "Skip this / turn it down" → Manage → `next` / `volume --percent 30` on the active Premium device.
