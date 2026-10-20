// Open-office layout: one wide room. World coordinates are "pixels" of a W x H low-resolution buffer.
// Desks sit in two rows; the walkway along the wall (under the windows) and the aisle between the rows stay free.
(function () {
  'use strict';
  const W = 768;
  const H = 400;
  const WALL_H = 120; // 30% of the world height
  const DY = 56; // everything that stands on the floor sits this much lower than in the 64 px wall of the reference office
  const ROW1 = 194;
  const ROW2 = 290;
  const SLOT_DX = 100;
  const SLOT_X0 = 66;
  const DOOR_X = W - 52;
  const DOOR_Y = WALL_H - 58;
  const WALK_Y = 142; // feet line of anybody standing under the windows
  const SLOTS = 7;
  const ENTITY_SCALE = 1.5; // desks, sims and the cat are drawn at 150% of the sprite size

  // Mini kitchen, bottom-left corner, an L: a vertical counter against the left edge (wall cabinet above its top end, coffee
  // machine on it), a lower run along the bottom edge with the water cooler standing on it, and the fridge by the lane.
  const KITCHEN = { x: 0, y: 224, w: 150, h: 176 };
  const VCOUNTER = { x: 3, y: 262, w: 30, h: 132 };
  const UCAB = { x: 3, y: 226, w: 42, h: 36 };
  const LRUN = { x: 33, y: 372, w: 108, h: 22 };
  const COFFEE = { x: 7, y: 246 };
  const CL = { x: 120, y: 314, w: 16, h: 60 };
  const FR = { x: 62, y: 262, w: 30, h: 70 };
  const WINDOWS = [{ x: 516, y: 16, w: 92, h: 66 }, { x: 614, y: 16, w: 92, h: 66 }]; // from the LED screen to the door
  const LED = { x: 208, y: 14, w: 298, h: 90 }; // runs to x=506: the clock and the bookshelf are gone
  const CLOCK = { cx: 436, cy: 74 };
  const BOOKS = { x: 454, y: 64, w: 52, h: 54 };
  // Control board: a cork board at the left end of the wall. A red pin marks the CLI in use; an agent moves it when the
  // other card is clicked. Bottom left: "Konum: açık/kapalı", rewritten by an agent. With location on, a weather card
  // and a city card are pinned on the right.
  const BOARD = { x: 8, y: 12, w: 192, h: 94 };
  const TITLE = { x: BOARD.x + 8, y: BOARD.y + 6, w: 96, h: 16 };
  const NOTES = {
    claude: { x: BOARD.x + 8, y: BOARD.y + 28, w: 42, h: 22 },
    codex: { x: BOARD.x + 56, y: BOARD.y + 28, w: 42, h: 22 },
    city: { x: BOARD.x + 8, y: BOARD.y + 55, w: 90, h: 22 },
    weather: { x: BOARD.x + 108, y: BOARD.y + 6, w: 76, h: 70 },
    loc: { x: BOARD.x + 8, y: BOARD.y + 81, w: 64, h: 10 },
    langTr: { x: BOARD.x + 76, y: BOARD.y + 81, w: 14, h: 10 },
    langEn: { x: BOARD.x + 92, y: BOARD.y + 81, w: 14, h: 10 },
    usage: { x: BOARD.x + 108, y: BOARD.y + 80, w: 76, h: 12 }, // Agents Deck: subscription usage of the three CLIs
  };
  const PINS = { claude: { x: NOTES.claude.x + NOTES.claude.w - 6, y: NOTES.claude.y + 4 }, codex: { x: NOTES.codex.x + NOTES.codex.w - 6, y: NOTES.codex.y + 4 } };
  const PLANTS = []; // no plants for now
  // Clickable things: [id, x, y, w, h]
  const PROPS = [
    
    ['coffee', COFFEE.x - 1, COFFEE.y - 1, 26, 26], ['cooler', CL.x, CL.y, CL.w, CL.h], ['fridge', FR.x, FR.y, FR.w, FR.h], ['lang-tr', NOTES.langTr.x, NOTES.langTr.y, NOTES.langTr.w, NOTES.langTr.h], ['lang-en', NOTES.langEn.x, NOTES.langEn.y, NOTES.langEn.w, NOTES.langEn.h],
    ['cli-claude', NOTES.claude.x, NOTES.claude.y, NOTES.claude.w, NOTES.claude.h], ['cli-codex', NOTES.codex.x, NOTES.codex.y, NOTES.codex.w, NOTES.codex.h], ['loc', NOTES.loc.x, NOTES.loc.y, NOTES.loc.w, NOTES.loc.h],
    ['led', LED.x - 4, LED.y - 3, LED.w + 8, LED.h + 7],
    ['window0', WINDOWS[0].x, WINDOWS[0].y, WINDOWS[0].w, WINDOWS[0].h], ['window1', WINDOWS[1].x, WINDOWS[1].y, WINDOWS[1].w, WINDOWS[1].h],
  ];
  // Where an ambient visitor stands for each kind of place (feet position)
  const SPOTS = {
    coffee: { x: 47, y: 282 },
    cooler: { x: 106, y: 352 },
    fridge: { x: FR.x + FR.w / 2, y: FR.y + FR.h + 16 },
    dishes: { x: 90, y: 366 }, // in front of the lower counter, where used cups pile up and get washed
    led: { x: LED.x + LED.w / 2, y: WALK_Y },
    windows: WINDOWS.map((w) => ({ x: w.x + w.w / 2, y: WALK_Y })),
  };
  const CAT_HOME = { x: 300, y: 316 };

  const SKIN = ['#f2c9a0', '#d9a47c', '#f6d2b0', '#c68863', '#8d5a3b', '#e8b58e', '#e3ad86'];
  const HAIR = ['#2b1d16', '#4a2f1d', '#e0a030', '#9a9a9a', '#111111', '#7a3cff', '#c4462c', '#ff6fb0', '#5a3b1f', '#ffd966'];
  const SHIRT = ['#ffcf4a', '#ff8a4c', '#4f7cff', '#ff9ccf', '#3ddc84', '#2fc6d6', '#9b6bff', '#e2445c', '#3ccf8e', '#4fa8ff'];
  const PANTS = ['#3b3f66', '#2c2f4a', '#2a2a3a', '#3a2f55', '#263238', '#222', '#2e2a44'];
  const STYLES = ['short', 'spiky', 'long', 'bun', 'afro', 'cap', 'short'];
  const hash = (s) => [...String(s)].reduce((n, c) => (Math.imul(n, 31) + c.charCodeAt(0)) | 0, 7) >>> 0;
  const pick = (list, h, salt) => list[Math.floor(((h >>> 0) * (salt + 3) + salt * 7919) % list.length)];

  function lookFor(id) {
    const h = hash(id);
    return { skin: pick(SKIN, h, 1), hair: pick(HAIR, h, 2), shirt: pick(SHIRT, h, 3), pants: pick(PANTS, h, 4), hairStyle: pick(STYLES, h, 5), glasses: h % 3 === 0, hoodie: h % 5 === 0 };
  }
  // desk items (the monitor is the desk's light source; no lamps)
  const DESK_ITEMS = [['papers', 'mug'], ['mug', 'papers'], ['trophy', 'mug'], ['blueprint', 'mug'], ['magnifier', 'papers'], ['mug', 'box'], ['palette', 'papers'], ['server', 'mug'], ['mug', 'papers']];

  // Roster from the server: one desk per coordinator, in two rows.
  function place(coordinators) {
    const agents = [];
    const free = [];
    for (const row of [1, 2]) for (let i = row === 2 ? 3 : 0; i < SLOTS; i++) free.push({ row, i }); // row 2 keeps its left end for the kitchen
    coordinators.forEach((c, n) => {
      const s = free[n];
      if (!s) return;
      agents.push({ id: c.id, name: c.name, names: { tr: c.name, en: c.nameEn ?? c.name }, short: c.deskName, shorts: { tr: c.deskName, en: c.deskName }, role: 'koordinatör', desk: c.deskName, big: false, accent: '#4fa8ff', x: SLOT_X0 + s.i * SLOT_DX, y: s.row === 1 ? ROW1 : ROW2, look: lookFor(c.id), items: DESK_ITEMS[n % DESK_ITEMS.length], kind: 'coordinator' });
    });
    return agents;
  }

  window.OfficeLayout = { DISH_LIMIT: 8, DISH_MAX: 12, KITCHEN, VCOUNTER, UCAB, LRUN, COFFEE, CL, FR, ENTITY_SCALE, W, H, WALL_H, DY, DOOR_Y, ROW1, ROW2, DOOR_X, WALK_Y, WINDOWS, LED, CLOCK, BOOKS, BOARD, TITLE, NOTES, PINS, PLANTS, PROPS, SPOTS, CAT_HOME, place, lookFor };
})();
