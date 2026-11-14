# Dev log — Shelf Life vertical slice

Scope was agreed with the user as a **focused slice** (usage limits): a fully built Depths, compact Threadmarket and
Heights, the whole Chapter 1 loop, a core Playwright suite and 2–3 improvement rounds. **3 improvement rounds
were completed** (not the 6 the original brief asked for).

## Environment

- Windows 11, no Node/Python/git/Blender preinstalled → portable Node 26.13.1 (SHA-256 verified against nodejs.org) in `tools/`.
- GPUs: NVIDIA GeForce RTX 4060 Laptop + Intel UHD (integrated). Chromium uses the Intel GPU by default;
  `--force_high_performance_gpu` selects the RTX. Both are **hardware** renderers (ANGLE/D3D11), not SwiftShader.
- Blender: not installed → JS per-vertex light bake fallback (see README).

## Performance (measured, 1920×1080, frame-rate cap removed, 5 s samples, `scripts/perf.mjs`)

| Scene | RTX 4060 FPS (p95 ms) | Intel UHD FPS (p95 ms) |
| --- | --- | --- |
| Depths, player height | 160.0 (8.1) | 40.1 (32.7) |
| Threadmarket, player height | 155.1 (9.0) | 32.6 (44.0) |
| Candy event rush (29 people on screen) | 109.5 (12.3) | 38.4 (33.7) |
| The Heights | 127.4 (10.9) | 37.0 (34.9) |
| Cabinet overview (147 people, 2.36 M tris) | 93.6 (14.4) | 26.8 (50.2) |

Draw calls 245–320 at player height (673 in the overview). On the RTX the 60 FPS target is met everywhere with
headroom. On the integrated GPU it is **not** met at full 1080p resolution; adaptive resolution (on in normal play,
off in these measurements) and the Low quality preset are the mitigations.

**Low preset** (`?quality=low`: 75% resolution, no bloom, smaller shadow map/textures), Intel UHD, 1920×1080, uncapped:
Depths 87.9 FPS (p95 13.6 ms), Threadmarket 68.7 FPS (p95 18.4 ms), versus 49.9 / 41.5 on High in the same run.

## Test results (final code)

`npx playwright test`: **15 passed (5.7 min)**, hardware GPU (Intel UHD via ANGLE/D3D11), one worker:

```
ok  1 opening: title, skippable intro, waking alone, reacting (19.8s)
ok  2 startup and rendering (6.9s)
ok  3 movement, sprint and jumping (9.4s)
ok  4 camera works without pointer lock: drag and arrow keys (6.7s)
ok  5 walls, corners and the enterable home (14.2s)
ok  6 stairs and the paper-clip bridge (17.9s)
ok  7 NPCs are active (9.6s)
ok  8 collection and inventory (6.4s)
ok  9 purchases, sales and insufficient funds (6.3s)
ok 10 candy event: hand, impact, shards, crowd and economy (16.3s)
ok 11 quest progression and choice consequences (authority path) (48.7s) — selling clears the levy
ok 12 full chapter via autopilot (community path) (2.4m) — 55 owed afterwards (re-run after the fine was cut to 15: passed)
ok 13 save and load restore real progress (13.2s)
ok 14 restart clears progress (10.1s)
ok 15 audio: enable sound and play effects (7.5s)
```

Extra regression check (`scripts/reload-candy.mjs`): saving right after Odo summons the giant, then reloading
and pressing Continue, still delivers the drop to the Commons (landing 2, 20, 5.6; 10 shards; 17 residents rushing).

## Late fixes (after the advisor's review)

- A candy drop pending in a save landed at the world origin after reload → landing defaults to the Commons; re-arm on load.
- If the crowd takes every shard, the giant returns within ~40 s instead of 5–7 minutes.
- Intro skip by key was unreliable → dedicated skip flag.
- Boardwalk pods could be walked into → collider covers the full 4-unit depth.
- `?quality=low` only shrank textures → it now applies the full Low preset.

## Changes after the creative review

- Rename to Shelf Life (title, browser tab, save keys).
- New opening: you wake alone inside your own empty matchbox and choose how to react (shout for help / stay still and listen / look for a way out). Mara's greeting reflects that choice, and she withholds the big answers ("you wouldn't believe it on an empty stomach").
- The candy choice now has a cost. Every newcomer owes the Shelf Authority a 40-token arrival levy (shown in the HUD). Selling the shards to Warden Calloway clears the levy, pays 15 tokens per shard (capped at four) and grants a day permit. Giving them to the Common Table adds a 15-token fine (55 owed). Debtors are refused by the Glasshouse Reserve, and the Registry won't file the Water Petition or record residence until the levy is paid. (Balance and five text edits came from Fable's second review; re-run afterwards: 15 passed, 5.6 min.) Calloway now argues for rationing: three falls ago an unrationed drop left four dead and a lift cable cut.

## The Underfall update

Built:

- **The Sump Ward:** a hunting ground west of the Spill in the Depths, behind a gate that opens after Ines's lift job.
  It holds Duke Tallow's claims table, his Tallymen (45 HP, hook strike 10, sit down for 20 s instead of dying),
  the sardine-tin cart and the giant cover objects.
- **Falls:** every 150–210 s the giant drops 6–9 pickups into the Sump. Tallymen race you for them. Collapsing in
  the Sump costs half your haul.
- **Weapons:** the Pick (toothpick spear, three-hit combo), the Snapband (hold Q to charge, 8–22 damage) and grit,
  all crafted at the workbench. Pointer lock moved from double-click to L.
- **Dust Hoppers:** four jumping spiders (30 HP) with a telegraphed rear and lunge, drops of silk and fangs, and a
  75 s respawn.
- **Home progression:** Stash Tin, Tealight Stove, Drip Barrel and Fang Wall, each shown as a set piece in the
  matchbox.
- **Items and trade:** grit, spider silk, hopper fang and wrapper foil. The Union (Rook) buys foil, silk and fangs.
- **URL params:** `?state=sump`, `?kit=1` and `?event=fall`.

Cut for now (from the spec): the Cellar Weaver, raids and the Pin Latch tier, daily claims, dodge, the aim-arc
preview and web slow patches.

Fable designed the update (spec in `DESIGN_UNDERFALL.md`). Opus implemented it. A Sonnet subagent wrote its tests.

Test run after the update (`npx playwright test`): **19 passed (5.8 min)**. The 15 earlier tests still pass. The 4 new ones also passed twice with `--repeat-each 2`:

```
ok 16 Sump: the Pick kills a Dust Hopper for silk (6.4s)
ok 17 Sump: the Snapband fires grit (5.4s)
ok 18 Sump: a Fall drops pickups the player and the Tallymen compete for (11.0s)
ok 19 Home progression: build the Stash Tin and keep the stash through save/load (5.8s)
```

Known rough edge: the home panel doesn't refresh items that arrive while it's open; reopen it with F.

## Model use

Opus 5.5 wrote and debugged the game. A Sonnet subagent wrote the audio test and took the Low/High
quality measurements. A Fable 5.2 subagent wrote the creative review (`CREATIVE_REVIEW.md`). Mid-build
reviews came from this session's built-in advisor tool, whose model isn't identifiable from inside the session.
After the review, Opus implemented the top three suggestions, Haiku updated these docs, and Fable reviewed the changes.

## Improvement rounds

Each round: run → capture views (`scripts/capture.mjs`, 12 views) → inspect → fix the three largest weaknesses →
re-run affected checks → check performance.

**Round 1** (shots/r1)
1. Upper tiers read grey/flat with harsh white LED strips, so wealth didn't read from outside → warm soft
   strip lights, extra baked lamps and moss along rich shelf fronts, pastel + gold pods.
2. Apartment pods were flat boxes with black windows on a strict grid → jittered placement, mixed materials
   (paint/cardboard/foil/corrugated), eaves, matchstick window frames, curtains instead of black holes,
   doorway cloth and small awnings, railings on balconies.
3. Pearl-lamp glare and fingerprints reading as concentric "targets" → dimmer bulbs with gold caps,
   sparse smeared partial prints at lower opacity. Also pointed the curated candy view at the glass so the
   hand is actually in frame.

**Round 2** (shots/r2)
1. The establishing view was too dark to read → exposure lifts smoothly when the camera is outside the glass.
2. Heights townhouses read as flat white blocks → floors, warm windows and velvet rooms inside translucent walls.
3. Large blank brown boundary walls in the market → cloth banners, drying fabric, stacked goods.

**Round 3** (shots/r3, r3b)
1. Water puddle glare → rougher, less reflective water.
2. Faces were blank → mouths that move while talking/cheering.
3. Cabinet floor mirrored the moonlight → rougher varnish. Measured performance on both GPUs (table above).

## Bugs found by running the game (and fixed)

- Market stair colliders ignored their frame height and blocked the Depths lane → absolute collider heights.
- Shallow apartment stacks produced negative-depth boxes (NaN geometry) → clamped setbacks.
- Lift platform flush with the floor wasn't chosen as ground → ties prefer moving platforms.
- Candy impact callback ran before shards existed → reordered.
- NPC nav links crossed the checkpoint enclosure and the granary; a booth sat on a path → re-routed.
- Ines intercepted the lift-repair interaction → she now fits the parts herself when you have them.
- Early scavenging filled the pack with metal before the bed was fixed → quest-aware loot.

## Look, animation and multiplayer update

**Look** (shots/light1, dof1/2, aa1/2, final). Render cost measured with `tools/shots.mjs` (30 forced renders of
the full post chain at 1280×720): about 13.7 ms before, 15–16 ms after.
- Warm desk-lamp key (2.6, shadowed), cool window fill, brighter hemisphere bounce, warm dusty fog instead of black.
- Macro depth of field on in play: a custom bokeh pass reads the main render's depth (the stock BokehPass re-rendered
  the scene, +7 ms). Everything from the lens to 9 m past the player stays sharp; only the far world softens.
- FXAA instead of MSAA (4× MSAA measured +10–14 ms). Light colour grade and vignette.
- Bloom threshold raised from 0.92 to 1.6 (linear HDR). The brighter key pushed lit white walls past the old threshold,
  and the Chapter Zero establishing shot bloomed to solid white. Now only lamps and emissives glow.

**Animation** (contact sheets via `tools/anim.mjs` → shots/anim1/2.png; checked from stills, not in motion).
Walk→run blends by speed; heel-strike/toe-off and ankles; hip yaw and sway with counter-rotating shoulders; banking
into turns; landing squash scaled by fall speed; 0.18 s crossfade between poses; jump and fall poses; blinking,
ears, ribcage. Stride length re-fitted to stop foot sliding.

**Multiplayer** (`tools/mp-server.mjs`, `src/net/net.ts`, `tests/mp.spec.ts`). A small RFC 6455 relay rides on
the Vite dev/preview server at `/mp`. Clients own their movement; the server validates state, range-checks and
rate-limits hit claims, caps damage, and owns loot bags (first claimer wins). Knock-down drops half of up to three
stacks and gives 6 s of protection. The frame codec has an assert self-check (`node tools/mp-selfcheck.mjs`).
