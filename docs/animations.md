# Animation inventory

Reference for developing animations. Everything here was read from the code (`office/public/js/`); line numbers drift,
so each entry names the file and the function or constant to search for. Times are seconds of sim clock (`view.t`)
unless noted. Behaviour rules live in `AGENTS.md`; this file only says where things are and how they fit.

## 1. How the pieces fit

```text
app.js ── creates ──► OfficeView (office.js)  ◄── owns ── walks, bubbles, fx, particles, sched, cat state, snapshot
   │                     │  draw() every frame: background → windows → wall → prop fx → board → cables → floor LED
   │                     │        → entities sorted by y → pin flight → particles → lighting → vignette → text layer
   │                     ├── window.OfficeCat   (leya.js)      cat state machine, called from view.catUpdate()
   │                     ├── view.kitchen       (kitchen-life.js) drink / dish choreography
   │                     ├── view.fireplace     (fireplace-life.js) breaks and night hearth
   │                     └── window.OfficeScreens (screens.js) idle monitor scenes
   └─ creates ─► Life (life.js): ambient director, tick() every frame
                    dispatches walk / schedule / act events to kitchen, fireplace, workflow, screen power
```

Time-driven state lives in plain data so a page refresh resumes it (`view.snapshot()` / `restore()`, `life.snapshot()` /
`restore()`). The three event channels, all carrying plain-data descriptors, never closures:

| Channel | Producer | Consumer | Use |
| --- | --- | --- | --- |
| `walk` events (`arrive`, `done`) | `view.walkTo(id, dest, { act })` | `life.onWalk(id, evt, act)` | something to do on reaching a spot |
| `schedule` | `view.schedule(delay, act)` | `life.onSched(act)` | delayed step (kitchen steps, publish, jump landing) |
| `act` on bubbles/handlers | `view.say(..., { act })` | `life.onAct(act)` | speech finishing or interrupted |

New choreography: add an `act.type`, route it in `life.onWalk` / `onSched` / `onAct` to your module, keep state in a
`snapshot()`/`restore()` pair, and never capture closures in the descriptors.

## 2. Time and light (`office.js`)

`view.darkness()` maps the clock (override with `window.OFFICE_HOUR`) to 0..0.56:

| Hours | darkness |
| --- | --- |
| 08–17 | 0 (full day) |
| 17–19 | 0 → 0.3 |
| 19–21 | 0.3 → 0.5 |
| 21–05 | 0.56 (night) |
| 05–08 | 0.56 → 0 |

Consumers: `drawWindows` (sky palette: day below 0.05, evening up to 0.4, night from 0.4; stars, moon, clouds, skyline lights from
0.25), sun shafts `beam = 1 − dark·3` plus drifting motes, `drawLighting` (`on = (dark−0.05)/0.35` for lamps and screens,
`moon = (dark−0.35)/0.2` for moonlight shafts), `drawWallDynamic` (red board lamp, LED scan line), fireplace (`lit()` at
darkness ≥ 0.45), Leya window watching (night flag when ≥ 0.3).

`drawLighting` order matters: dark overlay → floor emission → screen light cones and bloom → point glows (coffee LED, cooler lamp,
fridge display, exit sign, board lamp) → logo marks → exit sign → emissive screens redrawn above the overlay → fridge fan of
light → moonlight → fireplace light mask. New light sources add themselves here, after the overlay.

## 3. Draw order and depth

`draw()` builds an entity list sorted by `y` (feet): desk stations (with their character), plants, cat, fridge, dishes, hearth
chairs/companions, and walking characters. Anything attached to an actor draws inside that actor's entry so it shares depth
(kitchen cups via `kitchen.drawActor`, the news disk via `drawNewsDelivery`). Pressure pads and cables are painted before
actors. Screen-resolution text (LED, board text, name plates, cat name, bubbles) is drawn last.

## 4. Walking (`office.js`, `nav.js`)

- `nav.js`: 4-px grid, blocked rectangles from layout, A* with line-of-sight smoothing, `snap()` to the nearest free cell.
- `view.walkTo(id, dest, opts)`: phases `go` → `stay` → `back` (`WALK_SPEED` 62 px/s). Options: `stay` seconds or `hold`
  (until `release(id)`), `pose` (`stand`, `back`, `mug`, `lounge`), `target` (agent being visited), `act`, `from`, `backToDesk`.
  Returns false if the actor is already walking or pinned (open chat).
- Walk frames: `Math.floor(t·8) % 4`; one-pixel bob on alternate frames; left-facing flips the sprite unless a hand holds a cup.

## 5. Character sprites (`sprites.js`, drawn by `drawWalkerInner` / `drawStationInner`)

| Function | Poses / frames | Used for |
| --- | --- | --- |
| `K.back(look, f, drinkArm)` | 2 typing frames | seated at the desk; typing rate 9 Hz, breathing every ~1.2 s when idle |
| `K.work(look, phase, variant, beat)` | 3 phases × 3 variants × 4 beats | Application Studio workflow (search / evaluate / prepare) |
| `K.front(look, pose, f, freeLeft)` | `stand`, `walk` (4), `mug`, `cheer`, `wave`, `lounge` (2), `lounge-talk`, `lounge-stretch`, `pet-seat` | walking, standing visitors, hearth seating |
| `K.drinkArm(look, pose)` | `carry`, `reach`, `sip` | the held cup (kitchen `arm()` picks by hand/shoulder offset) |
| `standBack` (office.js) | single | window gazing, board work |

Seated lounge poses drop 3·settle px over 0.65 s after arrival. Power-jump uses `cheer` while airborne.

Overlays on a desk station: error icon (bouncing, red), thinking cloud (dots cycle at 2.5 Hz), workflow props
(`OfficeWorkflow.props`), a visitor turning the owner around (`talkedTo`).

## 6. Desk monitors (`screens.js`, `drawScreen`)

Priority in `drawScreen`: application workflow screen → News Desk preparation progress → idle scene → error flash →
working code screen (scrolling coloured lines, cursor blink).

Idle scenes (20×11 px, length in seconds before ±randomization): excel 16, x 14, instagram 14, facebook 14, vscode 20, claude 16,
codex 16, copilot 14, antigravity 16, whatsapp 16, chrome 18, football 22, basketball 20, tennis 20. Each desk has its own seed,
RNG and `recent` list (last three excluded). A 0.25 s dark dip marks scene changes. Each scene has `tint` and `light`, used by
`drawLighting` so the light a monitor throws matches its content. `setStatus` pauses a desk's stream while it works.

Application workflow (`application-workflow.js`): three phases (search, evaluate, prepare), variant changes every 9 s,
beat at 4 Hz, sparse phase-specific speech through the shared pools.

## 7. Ambient director (`life.js`)

`tick()` order: hearth/break → floor-display power requests → workflow → news delivery → gate (`document.hidden`, `nextAt`,
`busy ≥ 2`) → dish cleaning (needs `DISH_LIMIT` 8) → random activity. Kinds drawn from
`visit, visit, window, window, coffee, water, fridge, news, floorLed, desk`, up to four tries. After any start `nextAt = t + 25`
(`START_GAP_S`); after cleaning `+10`.

| Activity | Mechanics | Timing |
| --- | --- | --- |
| `visit` | host walks to a colleague (`visitSpot`), listener turns around; up to four alternating turns from a pooled exchange (`text`, `reply`, `followUp`, `answer`) | turn length `turnDuration` = clamp(2.2 + 0.05·chars, 3.5, 7.5); bubble 1.6× |
| `window` | walk to a window spot, back view, `window<i>` prop fx (bird by day, shooting star at night) | stay ≥ 6 |
| `coffee` / `water` | kitchen choreography (section 8) | – |
| `fridge` | solo at the fridge, door opens (fx `fridge`, 4.5 s) and lights the floor | stay ≥ 5 |
| `news` | solo at the LED, line must have a live `source` | stay ≥ 7 |
| `floorLed` | walk to the floor display corner, serializable comment (`floorLed.comment0..3`) | stay 7, repeat ≥ 155 s |
| `desk` | speech bubble at the desk, no walking | bubble `turnDuration·1.4` |

Pools (`Pools`): per-desk and shared floor pool, reloaded every 10 minutes, refilled by the server; line repeat rules 60 s per
pool, 10 minutes globally; English mirror preferred in EN. Bubbles are `view.say(id, text, { duration, act, thread, at })`.

## 8. Kitchen (`kitchen-life.js`)

Drink record per actor, phases:
`fetch → fill → pickup → carry-home → place → drinking → (sip, sip-done)* → collect → return → deposit → deposited`.
Fill triggers the machine/cooler prop fx and a 2.2 s timer; seated drinking lasts `120–240 s`, sip every `12–22 s` (2.4 s sip);
the cup stays on the desk slot (`deskPoint`) and returns by hand to the dirty counter. Only one actor fetches a given drink kind
at a time.

Cleaning record phases: `tap-on → reach → lift → to-sink → wash → rinse → dry → store → (next dish) → tap-off → done`.
Triggered at `DISH_LIMIT` 8 dishes; capacity `DISH_MAX` 12; stored dishes keep the last six. Cups render through
`cupPixels` and `arm`. Anything walking on a kitchen route sets `kind: 'drink' | 'clean'` and returns to the desk by its own path.

## 9. Fireplace and breaks (`fireplace-life.js`)

`available()` requires: no open chat, no board animation, no cat control, no screen power, no delivery, no ready/preparing news,
no workflow, every coordinator idle. `mode = lit() ? 'night' : 'break'` (darkness ≥ 0.45).

- Break: first after 3–7 min (`dayAt`), lasts 120–180 s, next after 12–20 min.
- Night: lasts 210 s, then `nextAt = t + 75`.
- Seating: two people use seats 0 and 2 (outer chairs), three people use all; the right chair (seat 2) is beside Leya's cushion.
- Conversation: four turns (`text`, `reply`, `followUp`, `answer`), 12 s before the first, 8 s between, pool kind `visit` by day and
  `fireplace` at night; speech 7 s.
- `relaxing(id)`: a 3 s stretch every 48 s per seat (staggered). `petting`: the right-chair person pets Leya every `38–58 s` for 4 s.
- `dismiss()` turns walkers around from their actual position and ends Leya's hearth mode.

## 10. Leya (`leya.js`, sprite in `sprites.js` `catPose`)

State: `c.mode`, `t0`, `duration`, `route`, `surface` (`floor`, `counter`, `floor-led`), `awakeUntil`, `specialAt`, `target`, `toy`,
`control`, `hearth`, `afterPet`. Default durations (s): sleep 80, wake 1.2, yawn 1.6, stretch 2.8, sit 7, groom 8, roll 4.5,
look 7, crouch 1.3, play 5, knead 6, pet 2.8, rub 4, window-watch 12, window-listen 8, counter-look 4, counter-rest 10,
floor-look 5, floor-settle 2.8, floor-knead 4. Walk speeds: normal 22 px/s, chase 36, counter-walk 10. Cat frames: `frame % 8`,
blink on frame 7 for sit/look/pet/rub, ear twitch on frame 3.

Main cycle: `sleep → wake → yawn → stretch → sit`, then from `sit` (while awake):

- after `awakeUntil` (18–28 s awake): `home` (walk back to cushion) → `knead` → `sleep` 60–110 s;
- `specialAt` passed (first after 45 s, then 150 s after each trip) and 40%: a special trip (window, counter, floor), never the same twice in a row;
- 12%: `visit` a free colleague (`walk → rub`, purr, two hearts, comment at most every 10 minutes);
- 7%: wander to a corner and `look`;
- otherwise random pose: groom, look ×3, stretch, groom, roll, knead, crouch (→ chase a toy → `play`).

Trips:
- window: `wander → window-watch (meow + window prop fx) → window-listen → home`;
- counter: `counter-ready → jump (height 22) → counter-look → counter-walk → counter-rest → jump down (18) → counter-down`;
- floor LED: `floor-look → jump (6) → floor-cross → floor-settle → floor-knead → floor-nap` (70–110 s).

Controls: `OfficeCat.tryControl(v, action)` (75% when eligible) → `control-ready` (meow, jump 15 for pads, 24 for notes) →
`control-land` → `home`. Callback `onCatControl` fires at the mid-jump for notes, on landing for pads. Eligibility excludes open
or working chats only (`st.chatting`), a cat already controlling, mid-jump, or on the counter. Petting (`poke`): `pet` pose
2.8 s, hearts, purr; hearth petting is routed through the fireplace module.

## 11. Props and click reactions (`interact`, `drawPropFx`, `FX_DUR`)

Click or ambient `react(id)` starts `fx[id] = { t0 }`, ignored while active. Durations: plants 1.3 (a falling leaf particle), coffee 2.6,
cooler 1.8, fridge 4.5, clock 2.0 (cuckoo bird + bubble), books 1.6 (a book lifts out), board tap 2, door 3.0 (opens, light fan),
windows 3.2 (bird by day, shooting star when darkness ≥ 0.3). Always-on loops: coffee steam, cooler bubbles, board lamp, LED scan
line, window clouds and motes, door/exit sign. Particles: `leaf` (5 s) and `heart` (1.6 s).

## 12. Cork board and floor display

- Board: pin flight (`drawPinFlight`: lift 0.5 s, arc 0.9 s with 8 px height, drop 0.3 s), language flip (2.0 s, switch at 1.0),
  location label wipe/write (3.0–3.4 s), refresh/usage taps (1.8 s, green glow decays over 2 s), weather and city cards fading with
  `cardAnim`. Executed by a free colleague (walks to a spot below the card, back pose) or by Leya.
- Floor display (`office.js` `drawPowerPads`, `drawFloorCable`, `drawCableEmission`; content in `application-board.js`): ON/OFF pads, actor walks, jumps
  (`powerJump`: squash 0.12 s, flight 0.88 s lifting 15 px and moving 12 px, land 0.25 s, return 0.65 s), signal travels 4 s
  (`FLOOR_SIGNAL`), 5.2 s total; idle off after 5 minutes unless pinned.
- News delivery: Bora takes a disk (1.8 s pickup), carries it to the LED slot (1.6 s insert), publish step 2.2 s later.
- LED: rotates every 12 s with 0.5 s fade, `drawLedText` paging for long summaries; external profile uses `drawLargeLed`.

## 13. Sound (`sfx.js`)

`meow(variant)`, `purr`, `rustle` (plants), `brew` (coffee), `glug` (cooler), `cuckoo` (clock), `flip` (books), `creak` (door,
fridge), `tweet` (day window), `twinkle` (night window). `beeps`, `chalk` and `print` are defined but not called anywhere yet.
Triggered from `interact`, Leya and the kitchen; the audio context resumes if suspended (`sfx.js`).

## 14. Adding an animation: checklist

1. Pick the layer: prop fx (`interact` + `drawPropFx` + `FX_DUR`), actor pose (`sprites.js` + `drawWalkerInner`), kitchen/hearth
   style choreography (own module with `onWalk` / `onSched`), or Leya mode (`durations` + `update` switch + `catPose`).
2. Keep state as plain data; add it to `snapshot` / `restore`. Never put a function in a walk, bubble or schedule.
3. Respect guards: open or working chat, `isAway`, `pinned`, hidden tab (`document.hidden`), provider backoff for speech.
4. Respect depth: draw attached objects inside the owning actor's entity entry.
5. Light-emitting things draw again after the night overlay (see section 2).
6. Add bilingual strings to `i18n.js`; add tests in `test/` for pure logic (timers, eligibility, snapshot round-trip).
7. Verify with a Playwright screenshot at day (`OFFICE_HOUR = 12`) and night (`23`), and a refresh mid-animation.
