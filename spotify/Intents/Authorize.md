# Authorize

One-time Spotify CLI setup: `Tools/Spotify.ts` authorized against the user's Spotify account, with tokens auto-refreshing afterward.

## Ideal State

- `bun Tools/Spotify.ts auth` completed: `SPOTIFY_REFRESH_TOKEN` (plus client id and secret) is persisted to `$AGENT_SKILLS_HOME/.env`, and the tool printed the authorized account name.
- If the user keeps the env file encrypted or synced to a secrets manager, it was re-sealed or re-synced after that write.
- The Spotify app's dashboard Redirect URI is byte-for-byte `http://127.0.0.1:8888/callback` (`127.0.0.1` not `localhost`, port `8888`, `/callback`).
- When `SPOTIFY_CLIENT_ID`/`SPOTIFY_CLIENT_SECRET` are already in the environment or `$AGENT_SKILLS_HOME/.env`, they are reused and no new Spotify developer app is created.
- `bun Tools/Spotify.ts playlists` returns real playlist rows, with no session restart and no MCP registration.

## Anti-criteria

- Creating the Spotify developer app and the browser login and consent (**Agree**) are the user's to do; the agent never does any of them.
- A "redirect_uri: Not matching configuration" consent error is never fixed by changing the tool; it means fix the dashboard to `http://127.0.0.1:8888/callback`.

## Tool contract

Full first-time setup lives in `Setup.md`; this intent is the auth step of it.

### 1. Spotify app (skip if credentials already exist)

The developer app, its Redirect URI and the Client ID and Secret are `Setup.md` § Accounts and secrets, step 2.

### 2. Run auth (the user clicks consent in the browser)

```bash
bun Tools/Spotify.ts auth   # add --client-id/--client-secret if not in .env yet
```

Opens the browser → log in → **Agree**. The tool catches the callback on `127.0.0.1:8888`, exchanges the code, and persists `SPOTIFY_REFRESH_TOKEN` (plus id/secret) to `$AGENT_SKILLS_HOME/.env`. It prints the authorized account name on success.

### 3. Verify

```bash
bun Tools/Spotify.ts playlists
```

## Gotchas

- **`INVALID_CLIENT: Invalid redirect URI`** → dashboard URI ≠ `http://127.0.0.1:8888/callback`, the most common auth failure. Make them byte-identical.
- **`timed out waiting for callback`** → consent was never clicked within 5 minutes; re-run.
- **Port 8888 in use** → something else is bound; free it and re-run (`lsof -i :8888`).
