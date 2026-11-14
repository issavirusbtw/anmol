# Shelf Life — Chapter 1: A Place on the Shelf

A browser-playable 3D survival/exploration game: you are a 2.5 cm person inside a giant's display
cabinet, where thousands of tiny people have built a vertical city out of household scraps.
TypeScript + Three.js + Vite, procedural art and audio, Playwright tests.

The name lives in `src/config.ts` (`GAME_NAME`). It was renamed from the working title THE WALL, which echoed the reference show's storyline.

## Run it

Node.js is bundled portably in `tools/` (this machine had no Node). From the project folder in PowerShell:

```powershell
$env:PATH = "$(Get-Location)\tools\node-v26.13.1-win-x64;$env:PATH"
npm install          # only needed if node_modules is missing
npm run dev          # http://127.0.0.1:5173
```

Production build: `npm run build` then `npm run preview` (http://127.0.0.1:4173).

**GPU note (Windows laptops):** browsers often pick the integrated GPU. For full speed, set your browser
to "High performance" in Windows Settings → System → Display → Graphics, or launch Chrome with
`--force_high_performance_gpu`.

## Controls

| Key | Action |
| --- | --- |
| WASD | move (camera-relative) |
| Mouse drag (any button) / arrow keys | turn the camera — works without pointer lock |
| Wheel or − / = | camera distance |
| Shift | sprint (uses stamina) |
| Space | jump (hold for higher) |
| E | interact (talk, trade, scavenge, repair, ride lifts) |
| F | context action (drink at the drip, grab a candy shard) |
| Quick left-click / F | jab with the Pick (once crafted) |
| Hold Q | draw and fire the Snapband |
| L | lock or unlock the mouse pointer |
| I | pack / inventory / standing |
| M | cabinet cross-section map |
| R | unstuck (also in the pause menu) |
| Esc | pause: save, load, restart, settings |
| 1–9 | choose dialogue options |

Sound starts muted — click **♪ Enable sound** (top right) or toggle it in Settings.

**Phones and tablets** get on-screen controls automatically (`?touch=1` forces them on a desktop, `?touch=0` off):
thumb anywhere on the left half for a floating stick (push to the rim to sprint), drag on the right half to look,
tap the right half to jab. Buttons: Jump (hold for higher), Use (= E), Jab, Act (= F), Sling (hold, release to fire),
Pack, Map. To play on a phone, run the LAN server (see Multiplayer) and open `http://<your-PC-ip>:5173`.

## URL parameters

| Param | Effect |
| --- | --- |
| `?auto=1` | autopilot plays Chapter 1 through the real input path (virtual stick, key presses, real UI buttons) |
| `?seed=<n>` | deterministic world, textures, NPC looks/schedules and event variation |
| `?state=lower\|market\|upper` | start in the Depths / Threadmarket / the Heights with matching progression |
| `?state=sump` | start in the Sump Ward (Underfall hunting ground) |
| `?event=candy` | trigger the candy drop 2 s after start |
| `?event=fall` | trigger a Fall 3 s after start |
| `?kit=1` | give both weapons (Pick and Snapband) and 24 grit |
| `?view=wide\|market` | curated camera views (wide uses depth of field) |
| `?t=<seconds>` | run the real fixed-step simulation for t seconds, then freeze (deterministic stills) |
| `?quality=low\|high` | quality preset (also in Settings) |
| `?fresh=1` | ignore/clear the save · `?test=1` skip the title screen |
| `?room=<name>` | multiplayer room to join (default `main`; letters, digits, `-`, `_`) |
| `?mp=0` / `?mp=1` | turn multiplayer off · force it on in test mode (test mode is offline by default) |

Examples: `/?view=market&event=candy&t=7.2` (the hand reaching in), `/?state=market&event=candy`.

## What's in the slice

- **Three connected districts** on one cabinet with six tiers. The Depths (cabinet floor), Threadmarket (shelf 1)
  and the Heights (shelf 2, glass floor) are playable. Eleven more compartments are populated with
  procedural architecture, lights and walking crowds. Lifts connect the tiers; there are no loading screens.
- **The Depths (art benchmark passage, Drip Row):** an enterable matchbox home (broken → repaired states),
  Common Table kitchen under a jar-lid roof, Pell's Pantry stall with a wrapper awning, the leaking-straw
  water point with animated drips, the Spill scavenging heaps, the Salvage Union workshop, roof gallery
  reached by stairs, and a broken lift.
- **Threadmarket:** four furnished stalls (food, water, fabric, salvage), a boardwalk with stairs, a
  paper-clip bridge to the Threadrunners' spool tower, the Commons plaza, the Granary jar, a repair shop,
  a guarded checkpoint, string-light canopy, visible machinery.
- **The Heights:** polished tiles over a glass shelf (look down at the market), moss gardens, pearl lamps,
  translucent townhouses, the Registry of the Shelf (functional), the Glasshouse Reserve (luxury vendor),
  the Reservoir, a gold-chain promenade.
- **50 named NPCs** (19 Depths, 24 Threadmarket, 7 Heights) with roles, posts, schedules, A* navigation over
  walkable-geometry nav graphs, simulation LOD, walk/run/carry/serve/cook/work/guard/sit/talk/cheer/collect
  animations, plus 96 simplified walkers in the distant compartments.
  All people are articulated figures rendered through shared InstancedMeshes (~8 draw calls).
- **Survival:** health, hunger, thirst, stamina, carrying capacity (satchel upgrade); forgiving collapse.
- **Economy:** 7 vendors with stock, restocking, buy/sell, insufficient-funds handling, reputation discounts,
  supply-sensitive food prices (the candy drop makes food cheaper).
- **Factions:** Shelf Authority, Threadrunners, Common Table, Salvage Union — reputation changes prices,
  dialogue, the kitchen's welcome and the checkpoint.
- **Chapter 1 story** (Mara → eat → water → scavenge → repair home → trade → Ines's lift job → ride up → Odo →
  the giant's candy → give to the Common Table *or* sell to the Authority → checkpoint → the Registry), with
  distinct consequences and a concrete long-term goal (the Water Petition: 10 signatures, or a 150-token
  Heights residence). Repeatable work after: Threadrunner deliveries, Dov's repair jobs, scavenging, crafting.
- **The candy event:** shadow passes the glass (world dims), the glass door slides open, an original alien hand
  (lilac, three banded fingers, two thumbs, knit sleeve) reaches in and drops a sweet that cracks on impact
  (dust, sound, camera shake), shards scatter physically, the crowd rushes and competes for them, guards
  secure the core, supply/prices change, leftovers go to the Granary. Recurs every 5–7 minutes with four variants.
- **Saving:** versioned localStorage save covering position, stats, inventory, tokens, reputation, story stage,
  choice, flags, home/lift repairs, checkpoint, vendor stock, heap cooldowns, supply, lift positions and candy schedule.
- **UI:** paper-and-tape HUD, objective card + 3D objective marker, prompts, toasts, dialogue, trading, pack,
  workbench crafting, cross-section map, pause/settings/save/load/restart/unstuck, title + chapter cards.
- **Audio:** original procedural WebAudio — footsteps, jump/land, pickups, coins, eating/drinking, repairs,
  lift motor hum, crowd ambience, giant rumble/whoosh/impact, cheers. Starts muted.

## The Underfall (hunting, combat, home)

The Underfall update adds a hunting ground, weapons, a rival power and home upgrades to the Depths. The design
came from a spec saved in `DESIGN_UNDERFALL.md`.

- **The Sump Ward:** a new playable hunting ground west of the Spill in the Depths, reached through a gate in the
  west junk wall. The gate opens once Ines gives you the lift job. It holds Duke Tallow's claims table, two scrap
  heaps, giant cover objects (a domino, a die, a coin on edge, a marble), webs and the Tallymen's sardine-tin cart.
- **Weapons, crafted at the workbench:**
  - **Pick** (toothpick spear; 2 scrap + 1 fabric): quick left-click or F (when F has no other prompt) to jab.
    Jab, jab, lunge: 12/12/24 damage.
  - **Snapband** (hairpin sling; 1 metal + 2 fabric): hold Q to draw, release to fire grit. 8–22 damage depending
    on charge.
  - **Grit:** 1 scrap → 6.
  - Pointer lock moved from double-click to the L key.
- **Dust Hoppers:** 4 jumping spiders with 30 HP. They lurk, stalk and rear (a telegraph), then lunge for 12 damage.
  After a lunge they recover, and they take extra damage while recovering. They drop silk, and a fang 60% of the
  time, and respawn after 75 s.
- **Duke Tallow, Holder of the Fall Franchise:** a rival power licensed by the Authority, found at the claims table.
  He is a trader and a talker. On the community path Calloway sold him your levy, so his **Tallymen** are hostile
  until it's paid. Otherwise they only race you to drops, unless you hit one.
- **Tallymen:** 45 HP, hook strike for 10. They are never killed: they sit down for 20 s and drop their load plus a
  few tokens.
- **Falls:** every 150–210 s the giant loses something down the back of the shelves into the Sump: crumbs, wrapper
  foil, a pin spill, a button cell or a stray sweet, as 6–9 pickups. Tallymen race you for them and haul them to the
  cart. Press E on the cart to lift goods back if no Tallyman is watching. Collapse in the Sump and half your haul
  goes to the cart.
- **Home progression** (F at your bed: "Improve your home"):
  - Stash Tin: storage that survives a collapse.
  - Tealight Stove: Hot Bowl, hunger +60 and double regen.
  - Drip Barrel: free water every 2 min.
  - Fang Wall: each mounted fang adds +2 max health, up to 120.
  - Each tier appears as a set piece in the matchbox.
- **New items:** grit, spider silk, hopper fang and wrapper foil. The Union (Rook) buys foil, silk and fangs.
- **Cut for now** (from the spec): the Cellar Weaver, raids and the Pin Latch tier, daily claims, dodge, the aim-arc
  preview and web slow patches.

## Multiplayer (collect and fight)

The dev and preview servers host a small WebSocket relay at `/mp` (`tools/mp-server.mjs`, no extra
dependencies). Every player who opens the game joins the same room and sees the others with a name tag and health bar.

- **Try it:** run `npm run dev` and open http://127.0.0.1:5173 in two browser windows (or two browsers, since each
  window uses its own save). Click Begin in both.
- **On your LAN:** `$env:LAN=1; npm run dev` binds to `0.0.0.0`; friends open `http://<your-PC-ip>:5173`.
  This is off by default so the dev server isn't exposed unless you ask for it. (In the Claude app, the
  `the-wall-lan` launch config does the same.) Windows blocks phones if the Wi-Fi is set to **Public**: switch it to
  **Private** and allow Node.js on private networks when Windows asks.
- **Fighting:** a quick left-click jabs another player (6 damage unarmed, 12 with the Pick); the Snapband hits too.
  At 0 health a player drops half of up to three stacks as a loot bag, then gets 6 s of protection.
- **Looting:** walk to a bag and press E. The server hands it to the first claimer only.
- **Safety:** each client moves itself; the server checks hits for range, freshness and rate, caps damage, and ignores
  players still in the tutorial. There are no accounts, so anyone who can reach the server can join; it is for
  friends, not the open internet.

## Put it online (public multiplayer)

`npm run build && npm start` runs the production server (`tools/serve.mjs`): the built game and the `/mp` relay on
one port (default http://127.0.0.1:8080; `PORT`, `HOST`, `TRUST_PROXY` come from the host). `render.yaml` deploys it
to [Render](https://render.com)'s free tier: put the repo on GitHub, then Render → New → Blueprint → choose the repo.
The free tier sleeps after ~15 minutes without visitors; the next visitor waits about a minute for it to wake.

Limits for the open internet (`tools/mp-server.mjs`, checked by `node tools/mp-selfcheck.mjs`): 16 players a room
(the 17th is told it's full), 100 rooms, 400 connections, 6 per address, 60 messages a second per player, 2 minutes
idle, one pack spill every 4 s; names and looks are cleaned before they're relayed. Test the production build with
`$env:BASE_URL='http://127.0.0.1:8080'; npx playwright test tests/mp.spec.ts` while `npm start` runs.

## Rendering approach (and the Blender fallback)

Blender is **not installed** on this machine, so the scripted Cycles bake was not possible. Instead:

- All static geometry is built procedurally (`src/world/*`) and merged per material and per tier chunk.
- **Baked light in JS at load time:** lamp bounce light and contact/back-wall occlusion are computed per vertex and
  stored in a `bakeLight` attribute that a shader patch adds as indirect light. Direct light comes from a
  pool of 9 real point lights reassigned to the nearest lamps, so baked surfaces aren't lit twice by the same lamp.
  Large surfaces are subdivided so the bake has resolution. This is per-vertex light, not a texture atlas.
- One shadow-casting directional "night light through the glass", hemisphere fill, a PMREM room environment
  for metal/foil/plastic reflections, ACES tone mapping, restrained bloom, exponential fog, a haze sheet behind
  the glass, fingerprinted glass with edge highlights, FXAA and a macro depth of field in play that keeps everything up to 9 m past the player sharp.
- Procedural canvas textures: cardboard (fibres, stains, print), exposed corrugation, crinkled foil, woven fabric,
  wood grain, scratched plastic, brushed metal, notebook paper, candy-wrapper prints, original matchbox labels,
  moss, crumb, a hand-painted sign atlas. Every part gets a hashed UV offset so repeats don't line up.

## Tests

```powershell
npx playwright test            # 15 end-to-end tests, ~6 min (one worker, hardware GPU via ANGLE/D3D11)
node scripts/autorun.mjs 500   # autopilot run with milestone screenshots → shots/auto
node scripts/capture.mjs shots/review   # 12 review views
node scripts/perf.mjs hp       # 1920x1080 FPS on the high-performance GPU (perf.mjs igpu for integrated)
```

The tests drive real gameplay: keyboard and mouse input, real UI buttons and the real simulation. Teleports are used
only to place the player at a start position; outcomes always come from gameplay systems.

See `DEVLOG.md` for measured results, performance and the improvement rounds.

## Known limitations

- **Scope:** this is the focused slice agreed for the usage budget. 3 of the 6 requested improvement rounds were done.
  Only the centre bay of shelves 0–2 is playable; the other 15 compartments are look-only.
- **No Blender bake:** Blender isn't installed, so baked light is per-vertex (JS) rather than unwrapped lightmap atlases.
- **NPCs** follow hand-authored nav graphs and don't collide with props or each other (they can clip through stools
  and each other in crowds). They don't ride lifts, and distant crowds are simple ping-pong walkers.
- **Play length is unmeasured with a human.** The autopilot clears Chapter 1 in ~138 s of game time; a first-time
  player exploring, talking and scavenging will take longer, but the 15–30 minute target hasn't been verified.
- **Integrated GPUs:** on the Intel UHD the game runs below 50 FPS at full 1080p. Adaptive resolution and the
  Low preset help (see DEVLOG). The RTX 4060 runs 94–160 FPS uncapped.
- Characters are stylised capsule figures with procedural animation (walk→run blend, banking, landing squash,
  pose crossfades), not skinned meshes; faces are simple.
- Multiplayer syncs players, hits and loot bags only. NPCs, candy drops, the giant and quests stay local to each
  player. Movement is client-trusted, so a modified client could cheat.
- Thin decorative rods without colliders can sit between the camera and the player.
- The premise (shrunken people kept in a tiered habitat by an alien child, candy from above) still echoes the TV storyline the reference images came from. The title, characters, factions, signs, sets and the alien are original. Review before any public release.
- `.claude/launch.json` stores an absolute path to the bundled Node; update it if the folder moves.

## Next steps (prioritised)

1. Human playtest of Chapter 1 for pacing (15–30 min) and difficulty; tune survival drain and loot.
2. NPC local avoidance (steering around props/each other) and lift-riding commuters between districts.
3. Open the right bay of Threadmarket and the rest of the Heights; make a distant compartment enterable.
4. Lightmap atlas baking (Blender/Cycles or a GPU path tracer) for the benchmark passage.
5. Chapter 2 hooks: the Water Petition outcome (Depths water quality, reservoir valve event) and the residence path.
6. More candy variants and landing sites, plus a second giant event (a lamp switched off, a cleaning cloth).
7. Finish the Underfall spec: Cellar Weaver, raids + Pin Latch, daily claims, dodge.
