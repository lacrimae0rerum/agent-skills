# Configure

Explain or change how herdr behaves on this machine.

## Ideal State

- A config question is answered from the live files: the answer cites the live file that causes the behavior.
- A change lands in the file that owns it; a change to the key mirror touches the terminal layer, the herdr layer and the `ThisInstall.md` note together, so they do not drift.
- The running server has picked up the change, and the behavior is confirmed in a real herdr pane: a keybinding pressed in a herdr pane, or the user's confirmation.
- `Tools/Freshness.ts` still reports `config_keys` fresh after the change.

## Anti-criteria

- `herdr config reset-keys` is never run without an explicit yes; it would erase the key mirror.
- The configured `prefix` and the key mirror (this install's values: `$AGENT_SKILLS_HOME/herdr/ThisInstall.md`, when present) are not changed unless the user asks to change them.
- An agent-state integration script that herdr installed into an agent's config directory is never hand-edited; it is reinstalled with `herdr integration install`.
- A keybinding is never called verified because the file read back changed; reading the file back proves only that the file changed.

## Inputs

A key or UI behavior inside herdr is decided by up to four layers, from where the key enters to where it is handled:

| Layer | File | Owns |
|-------|------|------|
| Terminal | the terminal's config, e.g. `~/.config/kitty/kitty.conf` (named in `ThisInstall.md`) | Whether the key reaches herdr at all (the `in_herdr` conditional maps and the empty maps above them) |
| Wrapper | the `herdr` function in the shell rc file, if the user has one | Setting and clearing `in_herdr`, hiding the terminal's own tab bar |
| Herdr | `~/.config/herdr/config.toml` | What herdr does with the key; theme, sidebar, toasts, sound |
| Hooks | the user's tab-naming hook, if any, and the agent-state scripts herdr installs (`herdr integration status` lists them) | Tab and workspace names, custom sidebar tokens the hooks report (for example `phase`, `model`, `ctx`, `doing`, `session`), agent state |

§ Terminal passthrough below explains why the terminal and wrapper layers exist. The agent-state scripts are installed and versioned by herdr.

## Terminal passthrough

This applies only when herdr runs inside a terminal that binds the same chords itself (kitty is the common case).

- **Passthrough maps.** Every chord herdr uses is declared in `kitty.conf` with `--when-focus-on "not var:in_herdr=1"`. While the focused kitty window carries the user var `in_herdr=1`, kitty skips its own mapping and the key reaches herdr, whose `config.toml` binds it. Outside a herdr window the same chord runs the plain kitty action.
- **Empty maps.** Each passthrough chord is also declared once with an empty action (`map cmd+n`) *above* its conditional map. kitty keeps its built-in default for a key alongside a conditional map, and that default always matches, so without the empty map `cmd+n` inside herdr opens a kitty OS window (and `cmd+t`, `cmd+w`, `cmd+k`, `cmd+h` run their kitty defaults) instead of reaching herdr. The empty map is the last match inside herdr and passes the key through.
- **The shell wrapper.** A `herdr` shell function sets the user var on the kitty window when it launches a herdr client (bare `herdr`, `--session`, `--remote`, `--no-session`, `--handoff`, `session attach`), optionally hides kitty's tab bar, runs the real binary with `command herdr "$@"`, then clears the var on exit. Subcommands like `herdr status` are not wrapped. A minimal version:

  ```zsh
  herdr() {
    local ui=0
    case "$1" in
      "") ui=1 ;;
      --session|--remote|--no-session|--handoff) ui=1 ;;
      session) [[ "$2" == attach ]] && ui=1 ;;
    esac
    if (( ui )) && [[ -n "$KITTY_WINDOW_ID" ]] && command -v kitten >/dev/null; then
      kitten @ set-user-vars --match "id:$KITTY_WINDOW_ID" in_herdr=1 2>/dev/null
      command herdr "$@"; local rc=$?
      kitten @ set-user-vars --match "id:$KITTY_WINDOW_ID" in_herdr= 2>/dev/null
      return $rc
    fi
    command herdr "$@"
  }
  ```
- **The herdr side.** `config.toml` holds a `[keys]` table matching the passed-through chords. Change a chord there and change its passthrough map in `kitty.conf` too. `cmd` chords need a herdr that speaks the kitty keyboard protocol (0.8+).

## Tool contract

- `herdr --default-config` lists every key this binary accepts, with defaults, as comments. It is the authority on key names.
- The config reference JSON from the docs index gives types, allowed values and prose per key.
- `herdr server reload-config` applies the server's `config.toml` without restarting it. Theme, sidebar layout and other presentation keys come from the client's own config, so they reach the screen only when the client reloads (`reload_config`, default `prefix+shift+r`) or reattaches. Before editing presentation keys, find the client whose screen you are changing: a `herdr remote-client-bridge` process under an `sshd-session` means the client runs on another machine, and the edit belongs in that machine's `config.toml`.
- `herdr config reset-keys` backs up the config and removes every custom keybinding, the key mirror included.
- `herdr integration status|install|uninstall` manages the agent-state hooks. Installing one writes into that agent's own config directory.
- Sidebar state colours are theme tokens: `red` is blocked, `yellow` is working, `teal` is done-unseen. This mapping is unverified, so confirm it by eye after applying a theme change. The `goto` action (default `prefix+g`) is the jump-to-any-workspace-tab-or-agent picker.
