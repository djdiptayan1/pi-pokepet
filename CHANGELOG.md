# Changelog

## 1.7.0 - In-terminal sprite mode + rolling usage bars

### Added

- `/pet style terminal` - render the animated Petdex sprite INSIDE the terminal widget (the same spot where the ASCII pet loads), with no desktop window. Uses Pi's native image protocol (crisp PNG) on Kitty/iTerm2/Ghostty/WezTerm and a truecolor ANSI half-block fallback on every other truecolor terminal. Same mood->action animation states as the desktop companion.
- Rolling usage bars beneath the energy/food bar showing token consumption over the last 5 hours and last 7 days, color-coded (green/amber/red) with cost.
- `/pet limit` to view usage and `/pet limit 5h <n>` / `/pet limit week <n>` to set caps (accepts `10m`, `50m`, `1.5b`, or raw numbers). Caps persist in `pokepet-state.json` (defaults 10M / 50M tokens).

### Notes

- Usage is read from pi's own session logs under `~/.pi/agent/sessions` (per-message tokens + cost), cached ~60s. Anthropic/OpenAI's real weekly & 5-hour subscription limits are not exposed to pi extensions, so these bars track your measured usage against your configurable caps rather than the provider's remaining quota.

### Internal

- Re-wired the previously dormant native/ANSI Petdex terminal renderers into the render path behind the new `terminal` style.
- Added `extensions/usage.ts` plus tests for cap parsing, token formatting, and rolling-window bucketing.

## 1.6.3 - Self-healing Electron runtime, Linux window fixes & CLI aliases

- Fixed the `Electron binary not found` error spam on fresh installs. Because pi installs extensions with `npm install -g --ignore-scripts`, Electron's binary download postinstall never ran, so the companion window could not launch (most visible on Linux). The extension now provisions the runtime itself at first use.
- Added a self-healing Electron bootstrap: on first image-mode launch the extension verifies the real binary (via `path.txt`, not just the `.bin` shim), and if it is missing, downloads it once in the background using Electron's own installer (with an `npm install electron --no-save` fallback). It forces `ignore-scripts=false` so it works even when the user's npmrc disables scripts.
- Added a live ASCII fallback for image mode: while Electron is installing, on headless/SSH/WSL sessions (no `DISPLAY`/`WAYLAND_DISPLAY`), or if setup fails, the terminal always shows an animated pet instead of erroring.
- Replaced the repeated `Electron binary not found` logging with single, transition-based user notifications (setup started / ready / failed).
- Added `/pet setup` (alias `/pet repair`) to install or repair the Electron runtime on demand, and surfaced an `Electron Runtime` line in `/pet status`.
- Moved `electron` from devDependencies to dependencies so the downloader ships with every install and the runtime auto-recovers after each `pi update`.
- Fixed the Electron companion spawning but never appearing on Ubuntu/Linux. npm-installed Electron's `chrome-sandbox` is not setuid-root, which crashed the renderer on launch; the window now launches with `--no-sandbox` (safe — it only loads local content). Added `--enable-transparent-visuals` and deferred the first paint so the transparent, frameless widget actually renders on X11 instead of showing nothing.
- Scoped the macOS-only `type: "panel"` window flag to macOS, since it prevented some Linux window managers from mapping the window at all.
- Added crash-loop protection: if the window dies within seconds twice (e.g. missing system libs like `libnss3`/`libgbm`), the pet falls back to ASCII and reports the reason in `/pet status` instead of relaunching on every render.
- Added a `pi-pet` CLI alias alongside `pi-pets` and `pi-pokepet`. Note: `npx` resolves by package name, so the canonical install-a-pet command is `npx pi-pokepet add <slug>`; the `pi-pet`/`pi-pets` aliases work when the package is installed locally.

## 1.6.2 - Electron Companion, Personalities, & Smart Notifications

- Added a transparent premium Electron companion window with a floating glassmorphic speech bubble for image style pets.
- Implemented deterministic buddy personality stats (Chaos, Curiosity, Snark) and rarity tiers (Common, Rare, Legendary) calculated from slug and nickname.
- Added smart task notifications (red/green glowing speech bubble and custom states) for build and test completions/failures.
- Added fallback installation of community pets using `npx -y codex-pets add <slug>`.
- Added `/pet uninstall <slug>` command to delete an installed pet and its assets from disk.
- Added `npx pi-pets add <slug>` and `npx pi-pokepet add <slug>` command-line binaries to download and install pets directly from the terminal.
- Fully integrated all 9 spritesheet animation states (idle, runRight, runLeft, wave, jump, failed, waiting, running, review).
- Implemented low energy click reaction (sad/flat failed animation and frantic vertical bounce with hurting quotes).
- Resolved global manifest cache pollution bug during testing by isolating `MANIFEST_CACHE_FILE` to `PI_POKEPET_PETDEX_DIR` when set.

## 1.6.0 - Native Petdex image rendering

- Added a native Petdex renderer that extracts full sprite-sheet frames as PNGs
  and renders them through Pi's TUI `Image` component on Kitty/iTerm2-compatible
  terminals.
- Preserved the full Petdex frame box for native image pets so small and large
  modes scale display size without cropping sprite content.
- Added native frame caching under
  `~/.pi/agent/pokepet-cache/petdex-native/<slug>/<hash>/`.
- Kept the ANSI truecolor half-block renderer as the fallback for terminals
  without Pi native image support, including Windows Terminal in this version.
- Moved ASCII and ANSI fallback output to component widgets so large pets are not
  cut off by Pi's plain string-widget line cap.
- Increased ANSI fallback detail budgets for small and large Petdex pets now
  that fallback rendering is no longer constrained by the plain string-widget
  cap.
- Changed `NO_COLOR` behavior so native image rendering still works when
  available; only ANSI fallback color output is blocked.
- Added native renderer/widget tests for PNG extraction, Kitty/iTerm2 image
  sequences, unsupported-terminal fallback detection, and display budgets.
- Added `@earendil-works/pi-tui` as a direct runtime dependency.

## 1.5.0 - Petdex image pets

- Added `/pet` as the new command surface and removed `/pokemon` registration.
- Added Petdex image mode with `/pet style image`, local `~/.codex/pets`
  discovery, `/pet gallery [query]`, and `/pet install <slug>`.
- Added ANSI truecolor half-block rendering for Petdex 8-column x 9-row sprite sheets, with
  cached frame conversion under `~/.pi/agent/pokepet-cache/petdex/`.
- Improved Petdex render clarity by cropping transparent sprite padding and
  using nearest-neighbor scaling instead of smooth downsampling.
- Prevented pet truncation by making Petdex frame width responsive to the
  current terminal, wrapping status text, and falling back from large ASCII art
  to compact ASCII art when the terminal is too narrow.
- Added a row budget for Petdex image pets so tall sprites like `steve-jobs`
  and `noir-webling` fit inside Pi's below-editor widget instead of being
  clipped vertically.
- Preserved the original Pokemon ASCII roster behind `/pet style ascii`, with
  the existing compact and large modes.
- Migrated persisted state from legacy `monKey` to `style`, `asciiPetKey`, and
  `imagePetSlug`.
- Added tests for Petdex metadata validation, sprite rendering, mood mapping,
  state migration, and mocked gallery install.

## 1.4.1

- Replaced the generic working-line text with pet-aware, repo-aware messages so Pi feels more like a playful coding companion during active work.
- Improved contrast on the working/status text so it reads more clearly in the terminal UI.

## 1.4.0 — detailed mode

### Added

- **`/pokemon large` — detailed art mode.** Switch the footer pet from the
  compact 3-line sprite to big, hand-drawn, fully animated line art. The default
  stays compact, so existing behavior is unchanged — large is strictly opt-in.
  - `/pokemon large` enlarges your current partner.
  - `/pokemon large <name>` switches to and previews a specific Pokémon.
  - `/pokemon small` (alias `compact`) returns to the compact pet.
  - `large`/`big` and `small`/`compact` aliases both work.
- **Detailed sprites for all 7 Pokémon**, each 15–16 lines with distinctive,
  recognizable features: Pikachu (ears, cheeks, zig-zag tail), Charmander
  (snout, belly, flame tail), Squirtle (hexagon shell, curled tail), Bulbasaur
  (ears, wide smile, back bulb), Eevee (fox ears, fluffy ruff, bushy tail),
  Jigglypuff (round body, hair curl), Psyduck (three sprigs, hands-to-head).

### Behavior

- Detailed mode reuses the **same** `tick()`→`render()` animation loop, mood
  eyes, energy-gated sway, and accents as the compact sprite, so it blinks,
  bobs (working), dances (happy), jitters (panic), naps with `z` (sleep), and
  stands guard with `☕` — identical to before, just bigger.
- Render size is tracked in `state.size` (`"small"` | `"large"`), defaulting to
  `"small"` each session.

### Compatibility

- Cross-terminal safe on **macOS, Windows, and Linux**: the body uses only
  box-drawing + ASCII characters (no wide emoji inside the art, which would tear
  column alignment), eye glyphs reuse the set the compact mode already ships,
  and `NO_COLOR` is honored.

### Internal

- New `extensions/sprites.ts` holds the large art map + animated frame builder.
- `extensions/mons.ts` now exports `EYES`, `WEAK_EYES`, and `THOUGHTS` so both
  the compact and detailed renderers share one animation vocabulary.

## 1.3.1

- Switch to secure, passwordless NPM OIDC Trusted Publishing to bypass 2FA safely.
- Enhanced release checks script to automatically bypass on pure CI/CD or chore Pull Requests.

## 1.3.0

- Added automated package version bump validation check.
- Added automated CHANGELOG.md modification verification check.

## 1.2.0 — keep-awake

- **Keep your system awake:** `/pokemon awake [reason]` stops the machine from
  sleeping while something runs in the background — cross-platform with no
  dependencies (macOS `caffeinate`, Linux `systemd-inhibit`, Windows
  `SetThreadExecutionState`). Release with `/pokemon sleep` (and the pet naps).
- The inhibitor is tied to pi's PID, so the lock auto-releases if pi exits or
  crashes — the system is never left awake forever.
- New vigilant **guard** mood (☕) shown while keep-awake is active; the pet
  refuses to sleep and a persistent `☕ awake` marker appears on the meter.

## 1.1.0 — reactive update

- **Real "thinking" mood:** splits the model stream by event type, so reasoning
  (`thinking_*`) now floats with a 💭 thought bubble — distinct from talking
  (`text_*`) and tool-call composing (`toolcall_*`).
- **Lively body animation:** beyond the eyes, the body now moves per mood —
  working bobs, happy dances side to side, panic jitters, thinking floats.
- **MCP reactions:** detects MCP tool calls (server-prefixed names like
  `firecrawl_*`, `linear_*`, and the `mcp` gateway) with their own line.
- **Accurate subagents:** subagent dispatch is now detected from the
  `subagent`/`task` tool call (was incorrectly firing on every prompt).
- **Feeding matters:** low energy droops the eyes, damps motion, and sends the
  pet to sleep sooner; full energy unlocks the wider, bouncier dance.
- **No more dozing mid-run:** the pet stays animated for the full duration of a
  long-running tool (bash/tests) instead of reverting to idle.

## 1.0.0 — final release

- README: full roster gallery showing every Pokémon's ASCII art with its type
  color, plus a colored banner image.
- Cross-platform: normalize Windows path separators in file-type detection so
  directory-based reactions (e.g. `tests/`) work on Windows as well as
  macOS/Linux. Uses only Node builtins — runs on macOS, Linux, and Windows.

## 0.1.0 — initial release

- 7 Pokémon companions: Pikachu, Charmander, Squirtle, Bulbasaur, Eevee,
  Jigglypuff, Psyduck — each with its own color, type, and personality lines.
- 7 animated moods (appear / talk / work / celebrate / panic / sleep).
- Spinning Poké Ball working indicator.
- Reacts to tools: tests, git (commit/push/pull/merge/rebase/stash/checkout),
  build, lint, install, dev-server, docker, network, search, dangerous commands.
- Reacts to PRs & reviews (`gh pr create/merge/review`, review/diff tools).
- Reacts to pi advanced features: subagents, model swaps, thinking-level changes,
  session forks, and compaction.
- File-aware (filename + type) and time-aware (morning/evening/late-night/weekend).
- Flow-state and struggle/redemption detection.
- Energy meter (`♥`) restored with `/pokemon feed`.
- Cross-session memory with bond tiers (stranger → bestie) and `/pokemon stats`.
- `/pokemon` command suite: list, choose, nick, feed, stats, hide, show.
