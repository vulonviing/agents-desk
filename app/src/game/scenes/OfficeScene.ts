import Phaser from 'phaser';
import type { AgentDTO, Floor, Room } from '../../types';
import { BG_COLOR, FONT, TILE } from '../constants';
import { AgentSprite, type Visual } from '../entities/AgentSprite';
import { emptyState, type GameBridge, type HostState } from '../bridge';
import { layoutFloor } from '../layout/floorLayout';
import { themeOf } from '../maps/catalog';
import { pickLine, type LineKind } from '../../services/dialogues';
import { layoutRoom, type RoomLayout } from '../layout/roomLayout';
import { buildFloorMap, type FloorMapResult } from '../maps/floorMap';
import { buildMasterMap, MASTER_ID } from '../maps/masterMap';
import { buildRoomMap } from '../maps/roomMap';
import { propsOf, type TiledMap, type TiledObjectLayer } from '../maps/tiled';
import { CameraController } from '../systems/cameraController';
import { CALM_CHOICES, createWorker, stepWorker, type Worker } from '../systems/behavior';
import { deliveryMode, type DeliveryMode } from '../systems/dispatch';
import { findPath } from '../systems/pathfinding';
import { stationStatus } from '../systems/stationStatus';

const T = TILE;
const MAX_ON_FLOOR = 6; // characters shown per room on the floor view (the rest are in the room)
const MONITOR_FRAMES: Record<string, number> = { off: 1, code: 2, think: 3, chart: 1, error: 2, done: 1, idle: 4 };

interface MonitorRef {
  sprite: Phaser.GameObjects.Sprite;
  roomId?: string;
  stationId?: string;
}

// The office scene: shows either a floor (all rooms) or one room, with agents as living characters.
// Game logic only; no React and no store in here.
export class OfficeScene extends Phaser.Scene {
  private bridge!: GameBridge;
  private state: HostState = emptyState();
  private cam!: CameraController;
  private objects: Phaser.GameObjects.GameObject[] = [];
  private tilemap: Phaser.Tilemaps.Tilemap | null = null;
  private mapKey = '';
  private mapSeq = 0;
  private builtKey = '';
  private agents = new Map<string, AgentSprite>();
  private monitors: MonitorRef[] = [];
  private seats = new Map<string, { x: number; y: number }>(); // roomId (floor) or stationId (room) → seat feet px
  private zones: { roomId: string; kind: string; name: string; x: number; y: number; w: number; h: number; doorX?: number; doorSide?: string }[] = [];
  private cells = new Map<string, { x: number; y: number; w: number; h: number }>(); // stationId → desk cell (room view)
  private layout: RoomLayout | null = null;
  private workers = new Map<string, Worker>();
  private incoming = new Map<string, { until: number; mode: DeliveryMode }>();
  private pendingVisits = new Map<string, string>();
  private dispatchStyles = new Map<string, DeliveryMode>();
  private coordinatorHomes = new Map<string, { x: number; y: number }>();
  private coordinatorGoals = new Map<string, string>();
  private movingKey = '';
  private signs: { roomId: string; kind: string; layout: (title: string, sub: string, tone: string) => void; rescale: (zoom: number) => void; destroy: () => void }[] = [];
  private signZoom = 0;
  private accent = 0x8f85a9;
  private banner: Phaser.GameObjects.GameObject[] = [];
  private corridor: { x: number; y: number; w: number; h: number } | null = null;
  private hoverId: string | null = null;
  private rngState = 987654321;
  private tick = 0;
  private masterSpeech: Phaser.GameObjects.Container | null = null;
  private observedIds = new Set<string>();
  private speechKey = '';
  private nextTalk = new Map<string, number>();
  private windows: Phaser.GameObjects.Sprite[] = [];
  private skyPhase = '';

  constructor() {
    super('office');
  }

  init(data: { bridge: GameBridge; state: HostState }) {
    this.bridge = data.bridge;
    this.state = data.state;
  }

  create() {
    this.cameras.main.setBackgroundColor(BG_COLOR);
    if (this.renderer.type === Phaser.WEBGL) this.cameras.main.postFX.addVignette(0.5, 0.5, 0.92, 0.28);
    this.cam = new CameraController(this);
    this.cam.onZoom = (z) => this.bridge.onZoom(z);
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => this.onPointerUp(p));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onPointerMove(p));
    this.time.addEvent({ delay: 420, loop: true, callback: () => this.animateMonitors() });
    this.time.addEvent({ delay: 250, loop: true, callback: () => this.cull() });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.clear());
    // CREATE fires after Phaser marks the scene active; initial rendering must not rely on a poll.
    this.events.once(Phaser.Scenes.Events.CREATE, () => { this.apply(this.state); this.bridge.onReady(); });
    // signs are drawn with the pixel font: redraw them once it has loaded
    void document.fonts?.load('8px "Pixelify Sans"').then(() => this.state.projects && this.refreshSigns()).catch(() => {});
  }

  // ---------- state in ----------

  apply(next: HostState) {
    const prev = this.state;
    this.state = next;
    if (!this.sys?.isActive() && !this.sys?.isPaused()) return;
    const viewKey = this.viewKey(next);
    if (viewKey !== this.builtKey || next.projects !== prev.projects) this.rebuild();
    this.syncAgents();
    this.updateMasterSpeech();
    this.updateSigns();
    this.animateObservations();
    for (const [id, a] of this.agents) a.setSelected(id === next.selectedAgentId);
  }

  private viewKey(s: HostState): string {
    if (!s.projects || !s.view) return '';
    if (s.view.kind === 'master') return `${s.projects.generatedAt}|master`;
    const floor = s.projects.floors.find((f) => f.id === s.view!.floorId);
    return `${s.projects.generatedAt}|${s.view.kind}|${s.view.floorId}|${s.view.kind === 'room' ? s.view.roomId : ''}|${floor ? floor.rooms.length : 0}|${s.view.kind === 'floor' ? Math.round(s.floorAspect * 4) : ''}`;
  }

  // ---------- views ----------

  private clear() {
    for (const o of this.objects) { this.tweens.killTweensOf(o); o.destroy(); }
    this.objects = [];
    this.masterSpeech?.destroy(true);
    this.masterSpeech = null;
    this.speechKey = '';
    this.nextTalk.clear();
    this.windows = [];
    this.skyPhase = '';
    for (const a of this.agents.values()) a.destroy();
    this.agents.clear();
    this.workers.clear();
    this.coordinatorHomes.clear();
    this.incoming.clear();
    this.pendingVisits.clear();
    this.dispatchStyles.clear();
    this.coordinatorGoals.clear();
    for (const sg of this.signs) sg.destroy();
    this.signs = [];
    for (const b of this.banner) b.destroy();
    this.banner = [];
    this.corridor = null;
    this.monitors = [];
    this.seats.clear();
    this.zones = [];
    this.cells.clear();
    this.layout = null;
    this.tilemap?.destroy();
    this.tilemap = null;
    if (this.mapKey) this.cache.tilemap.remove(this.mapKey);
    this.mapKey = '';
  }

  /** Windows show the real time of day (day / dusk / night) instead of a fixed sky. */
  private updateSky(hour = new Date().getHours()) {
    const phase = hour >= 7 && hour < 17 ? 'day' : hour >= 17 && hour < 20 || hour === 6 ? 'dusk' : 'night';
    if (phase === this.skyPhase) return;
    this.skyPhase = phase;
    for (const w of this.windows) w.setFrame(`window_${phase}`);
  }

  /** "Elevator ride": a short screen-fixed floor indicator when the user switches floors. */
  private elevatorRide(label: string) {
    const { width, height } = this.scale;
    const bg = this.add.rectangle(width / 2, height / 2, 260, 44, 0x151624, 0.92).setStrokeStyle(1, 0x8f85a9).setScrollFactor(0).setDepth(9000);
    const text = this.add.text(width / 2, height / 2, label, { fontFamily: FONT, fontSize: '16px', color: '#ffffff' }).setOrigin(0.5).setResolution(4).setScrollFactor(0).setDepth(9001);
    this.tweens.add({ targets: [bg, text], alpha: 0, delay: 650, duration: 350, onComplete: () => { bg.destroy(); text.destroy(); } });
  }

  private rebuild() {
    const previous = this.state.view && this.builtKey ? this.builtKey : '';
    this.clear();
    const { projects, view } = this.state;
    this.builtKey = this.viewKey(this.state);
    const floorName = view?.kind === 'floor' ? projects?.floors.find((f) => f.id === view.floorId)?.name : view?.kind === 'master' ? 'Lobi · Master' : null;
    if (previous && previous !== this.builtKey && floorName && (view?.kind === 'floor' || view?.kind === 'master')) this.elevatorRide(view.kind === 'floor' ? `▲ ${floorName.toUpperCase()} KATI` : `▼ ${floorName.toUpperCase()}`);
    if (!projects || !view) return;
    if (view.kind === 'master') {
      const result = buildMasterMap();
      this.materialize(result.map, result.worldW, result.worldH);
      const sign = this.makeSign(result.worldW / 2, 4, 160, MASTER_ID, 'master');
      sign.layout('MASTER YÖNETİCİ', 'YÖNETİM OFİSİ', '#e7c88c');
      const seat = this.seats.get(MASTER_ID)!;
      const marker = this.add.graphics().setPosition(seat.x - 16, seat.y - 28).setDepth(1000);
      marker.fillStyle(0x78dbae).fillPoints([{ x: 0, y: -7 }, { x: 4, y: 0 }, { x: 0, y: 7 }, { x: -4, y: 0 }], true);
      marker.fillStyle(0xbdf6ce).fillPoints([{ x: 0, y: -7 }, { x: 4, y: 0 }, { x: 0, y: 1 }], true);
      this.tweens.add({ targets: marker, y: seat.y - 30, duration: 1000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.objects.push(marker);
      this.cam.setWorld(result.worldW, result.worldH);
      this.cam.fit();
      return;
    }
    const floorIndex = projects.floors.findIndex((f) => f.id === view.floorId);
    const floor = projects.floors[floorIndex];
    if (!floor) return;
    let result: FloorMapResult | null = null;
    if (view.kind === 'floor') {
      const plan = layoutFloor(floor, floorIndex, this.state.floorAspect);
      if (!plan.rooms.length) return;
      this.corridor = { x: plan.corridor.x * T, y: plan.corridor.y * T, w: plan.corridor.w * T, h: plan.corridor.h * T };
      result = buildFloorMap(plan, floor, floorIndex);
    } else {
      const room = floor.rooms.find((r) => r.id === view.roomId);
      if (!room) return;
      this.layout = layoutRoom(room);
      result = buildRoomMap(this.layout, room, view.floorId, floorIndex);
    }
    this.materialize(result.map, result.worldW, result.worldH);
    this.buildSigns(floor);
    for (const z of this.layout?.openPlan ? [] : this.layout?.departments ?? []) {
      const text = this.add.text((z.x + z.w / 2) * T, (z.y + 0.6) * T, `${/^\d$/.test(z.step) ? `${z.step} ▸ ` : ''}${z.name}`, { fontFamily: FONT, fontSize: '9px', color: '#fff8e8', backgroundColor: '#303044', padding: { x: 4, y: 2 } }).setOrigin(0.5, 0).setResolution(4).setDepth(1000);
      this.objects.push(text);
    }
    this.cam.setWorld(result.worldW, result.worldH);
    this.cam.fit();
    this.cameras.main.fadeIn(220, 14, 15, 24);
  }

  private materialize(json: TiledMap, worldW: number, worldH: number) {
    this.mapKey = `map-${++this.mapSeq}`;
    this.cache.tilemap.add(this.mapKey, { format: Phaser.Tilemaps.Formats.TILED_JSON, data: json });
    const map = this.make.tilemap({ key: this.mapKey });
    this.tilemap = map;
    const sets = ['roombuilder', 'walls', 'collision', 'themes', 'themefloors'].map((n) => map.addTilesetImage(n, n)!);
    map.createLayer('ground', sets, 0, 0)?.setDepth(-2);
    map.createLayer('walls', sets, 0, 0)?.setDepth(0.2);

    const layer = (name: string) => (json.layers.find((l) => l.name === name) as TiledObjectLayer | undefined)?.objects ?? [];
    for (const o of layer('furniture')) {
      const p = propsOf(o);
      const s = this.add.sprite(o.x, o.y, 'props', String(p.frame)).setOrigin(0.5, 1);
      if (String(p.frame).startsWith('lz_window')) this.windows.push(s);
      if (p.flipX) s.setFlipX(true);
      s.setDepth(typeof p.depth === 'number' ? p.depth : p.layer === 'floor' ? 0.5 : p.layer === 'wall' ? 1 : o.y);
      if (p.anim === 'butterfly') {
        s.play('butterfly');
        this.tweens.add({ targets: s, x: o.x + 6, y: o.y - 3, duration: 1800 + (o.x % 700), yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      }
      if (p.anim === 'rack') {
        s.play('rack');
        s.anims.setProgress(Math.random());
      }
      if (p.role === 'monitor') this.monitors.push({ sprite: s, roomId: p.roomId as string | undefined, stationId: p.stationId as string | undefined });
      this.objects.push(s);
    }
    for (const o of layer('desks')) this.seats.set(String(propsOf(o).roomId), { x: o.x, y: o.y });
    for (const o of layer('stations')) {
      const p = propsOf(o);
      this.seats.set(String(p.stationId), { x: o.x, y: o.y });
      this.cells.set(String(p.stationId), { x: Number(p.tx) * T, y: Number(p.ty) * T, w: 4 * T, h: 4 * T });
    }
    for (const o of layer('zones')) {
      const p = propsOf(o);
      this.zones.push({ roomId: String(p.roomId), kind: String(p.kind), name: String(p.name ?? ''), x: o.x, y: o.y, w: o.width, h: o.height, doorX: typeof p.doorX === 'number' ? p.doorX : undefined, doorSide: typeof p.doorSide === 'string' ? p.doorSide : undefined });
    }
    void worldW;
    void worldH;
  }

  // ---------- agents ----------

  private currentAgents(): AgentDTO[] {
    const { view, agents } = this.state;
    if (!view) return [];
    if (view.kind === 'master') {
      const m = this.state.master;
      return [{ id: MASTER_ID, roomId: MASTER_ID, floorId: '', kind: 'project', skill: null,
        name: 'Master Yönetici', role: 'Tüm ofislerin yöneticisi', variant: m?.variant ?? 'adam3',
        status: this.state.masterBusy ? 'thinking' : 'idle', waiting: false, currentTask: null,
        model: null, deskId: null, deskName: 'Yönetim masası', lastActivity: null, recent: [], level: 'plan' }];
    }
    if (view.kind === 'room') return agents.filter((a) => a.roomId === view.roomId);
    // floor view: the first few agents of every room (the server lists live and busy ones first)
    const shown = new Map<string, number>();
    const residents = [...agents].sort((a,b) => Number(!!b.coordinator) - Number(!!a.coordinator)).filter((a) => {
      if (a.floorId !== view.floorId) return false;
      if (a.coordinator) return true;
      const n = (shown.get(a.roomId) ?? 0) + 1;
      shown.set(a.roomId, n);
      return n <= MAX_ON_FLOOR;
    });
    return residents;
  }

  private indexInRoom(a: AgentDTO): number {
    return this.currentAgents().filter((x) => x.roomId === a.roomId).findIndex((x) => x.id === a.id);
  }

  private syncAgents() {
    const want = this.currentAgents();
    const ids = new Set(want.map((a) => a.id));
    for (const [id, sprite] of this.agents) {
      if (!ids.has(id)) {
        sprite.destroy();
        this.agents.delete(id);
        this.workers.delete(id);
        this.coordinatorHomes.delete(id); this.coordinatorGoals.delete(id); this.dispatchStyles.delete(id);
        for (const [station, owner] of this.pendingVisits) if (owner === id) this.pendingVisits.delete(station);
      }
    }
    for (const a of want) {
      let s = this.agents.get(a.id);
      if (!s) {
        s = new AgentSprite(this, a.id, a.variant, a.name);
        this.agents.set(a.id, s);
        this.placeInitial(a, s);
      } else {
        s.setVariant(a.variant);
        s.setName(a.name);
      }
      if (this.state.view?.kind === 'master') {
        const seat = this.seats.get(MASTER_ID);
        if (seat) s.setFeet(seat.x, seat.y);
        s.setVisual(this.state.masterBusy ? 'think-seated' : 'work', 'down');
      }
      s.setActive(!!a.cliActive);
      if (this.state.view?.kind === 'floor') this.applyFloorVisual(a, s);
    }
  }

  private visualOf(a: AgentDTO): Visual {
    switch (a.status) {
      case 'working': return 'work';
      case 'thinking': return a.waiting ? 'wait' : 'think';
      case 'completed': return 'complete';
      case 'error': return 'error';
      case 'offline': return 'offline';
      default: return 'idle';
    }
  }

  private applyFloorVisual(a: AgentDTO, s: AgentSprite) {
    s.setVisual(a.status === 'offline' ? 'idle' : this.visualOf(a), 'down');
  }

  private placeInitial(a: AgentDTO, s: AgentSprite) {
    const { view } = this.state;
    if (view?.kind === 'floor') {
      const seat = this.floorSeat(a);
      if (!seat) return s.setVisibleInView(false);
      s.setFeet(seat.x, seat.y);
    } else if (this.layout) {
      if (a.coordinator && this.layout.stations.length) {
        const ordinal = this.currentAgents().filter(x => x.coordinator).findIndex(x => x.id === a.id);
        const home = this.layout.coordinatorDesks[ordinal]?.access ?? this.layout.spots.find(p => p.kind === 'coffee')!;
        let x = Math.min(this.layout.tilesW - 3, home.x);
        while (!this.layout.grid[home.y]?.[x] && x > 1) x--;
        const w = createWorker(a.id, this.layout, this.layout.stations[0]!.station.id);
        w.pos = { x, y: home.y }; w.mode = 'doing'; w.stationId = null; w.doing = 'visit'; w.path = [];
        this.workers.set(a.id, w); this.coordinatorHomes.set(a.id, { ...w.pos });
        const seat = this.seats.get(`coordination:${a.roomId}:${ordinal}`);
        s.setFeet(seat?.x ?? x * T + T / 2, seat?.y ?? home.y * T + T); return;
      }
      const station = this.layout.stations.find((x) => x.station.id === a.deskId) ?? this.layout.stations[0]!;
      if (!station) { s.setFeet(this.layout.tilesW * T / 2, (this.layout.tilesH - 3) * T); return; }
      const w = createWorker(a.id, this.layout, station.station.id);
      this.workers.set(a.id, w);
      const seat = this.seats.get(station.station.id)!;
      s.setFeet(seat.x, seat.y);
    }
  }

  private updateMasterSpeech() {
    if (this.state.view?.kind !== 'master') return;
    const text = this.state.masterBusy ? 'Bir düşüneyim…' : this.state.masterSpeech || 'Merhaba! Aklında ne var?\nKonuşmak için bana tıkla.';
    if (text === this.speechKey) return;
    this.speechKey = text;
    const seat = this.seats.get(MASTER_ID);
    if (!seat) return;
    this.masterSpeech?.destroy(true);
    const label = this.add.text(0, 0, text.length > 180 ? `${text.slice(0, 177)}…` : text, {
      fontFamily: FONT, fontSize: '8px', color: '#393440', wordWrap: { width: 134 }, lineSpacing: 3,
    }).setOrigin(0, 0).setResolution(4);
    const width = Math.max(98, Math.min(154, label.width + 18));
    const height = label.height + 18;
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.18).fillRoundedRect(-width / 2 + 2, -height - 10, width, height, 6);
    bg.fillStyle(0xfff8e8).fillRoundedRect(-width / 2, -height - 12, width, height, 6);
    bg.lineStyle(1, 0x9b846c).strokeRoundedRect(-width / 2, -height - 12, width, height, 6);
    bg.fillStyle(0xfff8e8).fillTriangle(-6, -13, 6, -13, 0, -4);
    label.setPosition(-width / 2 + 9, -height - 3);
    this.masterSpeech = this.add.container(seat.x, seat.y - 36, [bg, label]).setDepth(6000);
  }

  private animateObservations() {
    const roomId = this.state.view?.kind === 'room' ? this.state.view.roomId : null;
    for (const event of this.state.observations ?? []) {
      if (this.observedIds.has(event.id)) continue;
      this.observedIds.add(event.id);
      if (event.roomId !== roomId || Date.now() - Date.parse(event.at) > 15_000) continue;
      const destination = this.state.agents.find(a => a.roomId === roomId && a.deskId === event.to);
      const target = destination && this.agents.get(destination.id);
      const targetSeat = this.seats.get(event.to);
      if (event.kind === 'activation') { target?.say(`${event.provider === 'codex' ? 'Codex' : 'Claude'} · ${event.tool}`, true); continue; }
      const sourceSeat = event.from && this.seats.get(event.from);
      if (!sourceSeat || !targetSeat) continue;
      const source = this.state.agents.find(a => a.roomId === roomId && a.deskId === event.from);
      if (source) this.agents.get(source.id)?.say(`${event.file} yazıldı; diğer istasyon okudu.`, true, 6000);
      // A symbolic document follows the walkable aisles; metadata proves a write then a read,
      // not that independent CLI processes sent each other a message.
      const packet = this.add.text(sourceSeat.x, sourceSeat.y - 28, '▣', { fontSize: '15px', color: '#9bffd0', backgroundColor: '#254a40' }).setDepth(5000);
      this.objects.push(packet);
      const start = this.layout?.stations.find(s => s.station.id === event.from);
      const end = this.layout?.stations.find(s => s.station.id === event.to);
      const path = this.layout && start && end ? findPath(this.layout.grid, start.access, end.access) : null;
      const points = [...(path ?? []).map(p => ({ x: p.x * T + T / 2, y: p.y * T + T })), { x: targetSeat.x, y: targetSeat.y - 28 }];
      let i = 0;
      const next = () => {
        const p = points[i++];
        if (!p) { packet.destroy(); this.objects = this.objects.filter(o => o !== packet); target?.say(`${event.file} okundu.`, true, 6000); return; }
        this.tweens.add({ targets: packet, x: p.x, y: p.y, duration: path ? 65 : 1000, onComplete: next });
      };
      next();
    }
    if (this.observedIds.size > 300) this.observedIds = new Set((this.state.observations ?? []).map(e => e.id));
  }

  // ---------- frame loop ----------

  update(_time: number, delta: number) {
    const zoom = this.cameras.main.zoom;
    if (Math.abs(zoom - this.signZoom) > 0.01) {
      this.signZoom = zoom;
      for (const sg of this.signs) sg.rescale(zoom);
    }
    this.updateSky();
    for (const s of this.agents.values()) s.updateSpeech();
    if (this.state.view?.kind === 'floor') { this.animateFloorLife(_time); return; }
    if (this.state.view?.kind !== 'room' || !this.layout) return;
    const dt = Math.min(0.1, delta / 1000);
    const moving: string[] = [];
    for (const a of this.currentAgents()) {
      const s = this.agents.get(a.id);
      const w = this.workers.get(a.id);
      if (!s || !w) continue;
      if (a.coordinator) { this.stepCoordinator(a, s, w, dt); if (w.mode === 'walking') moving.push(a.id); continue; }
      if (a.deskId && this.pendingVisits.has(a.deskId)) { s.setVisual('visit'); continue; }
      const notice = a.deskId ? this.incoming.get(a.deskId) : null;
      if (notice && notice.until > this.time.now) { s.setVisual(notice.mode === 'visit' ? 'visit' : 'sofa'); continue; }
      const delegated = this.currentAgents().some(c => c.coordinator && c.cliActive && c.targetStationId === a.deskId);
      const working = !!a.cliActive || delegated;
      const previousMode = w.mode;
      stepWorker(w, dt, { layout: this.layout, demand: working ? a.deskId : null, sleeping: false, rng: () => this.rand(), weights: this.currentAgents().length > 3 ? CALM_CHOICES : undefined });
      if (w.mode === 'doing' && previousMode !== 'doing') {
        const neighbor = w.doing === 'visit' ? [...this.workers.values()].find(other => other.id !== w.id && other.stationId === w.spotId) : null;
        // ambient talk comes from the office's dialogue pool (picked locally, no model call per line)
        const officeId = this.state.view?.kind === 'room' ? this.state.view.roomId : a.roomId;
        const nb = neighbor ? this.state.agents.find(x => x.id === neighbor.id) : undefined;
        if (nb) {
          const line = pickLine(officeId, 'visit', a.name, nb.name, () => this.rand());
          if (line) {
            s.say(line.text);
            if (line.reply && !nb.cliActive) this.time.delayedCall(1800, () => this.agents.get(nb.id)?.say(line.reply!));
          }
        } else {
          const kind: LineKind = w.doing === 'coffee' ? 'coffee' : w.doing === 'cooler' ? 'water' : w.doing === 'window' ? 'window' : w.doing === 'sofa' ? 'news' : 'desk';
          const line = pickLine(officeId, kind, a.name, undefined, () => this.rand());
          if (line) s.say(line.text);
        }
      }
      // now and then a resident at an idle desk thinks aloud (ambient only, never real work)
      if (w.mode === 'seated' && !working) {
        const due = this.nextTalk.get(a.id);
        if (due === undefined) this.nextTalk.set(a.id, this.time.now + 15000 + this.rand() * 30000);
        else if (this.time.now > due) {
          const line = pickLine(a.roomId, 'desk', a.name, undefined, () => this.rand());
          if (line) s.say(line.text);
          this.nextTalk.set(a.id, this.time.now + 40000 + this.rand() * 50000);
        }
      }
      if (w.mode === 'walking') {
        moving.push(a.id);
        s.setFeet(w.pos.x * T + T / 2, w.pos.y * T + T);
        s.setVisual('walk', w.dir);
      } else if (w.mode === 'doing') {
        s.setFeet(w.pos.x * T + T / 2, w.pos.y * T + T);
        s.setVisual(w.doing === 'visit' ? 'visit' : (w.doing as Visual), w.doing === 'window' ? 'up' : 'down');
      } else {
        const seat = this.seats.get(w.stationId ?? w.home);
        if (seat) {
          // settle into the chair
          s.setFeet(s.x + (seat.x - s.x) * 0.35, s.y + (seat.y - s.y) * 0.35);
          if (Math.abs(seat.x - s.x) < 1 && Math.abs(seat.y - s.y) < 1) s.setFeet(seat.x, seat.y);
        }
        s.setVisual(working ? this.visualOf(a) : 'work', 'down');
      }
    }
    const key = moving.sort().join(',');
    if (key !== this.movingKey) {
      this.movingKey = key;
      this.bridge.onMoving(moving);
    }
  }

  private floorSeat(a: AgentDTO) {
    if (a.coordinator) {
      const zone = this.zones.find(z => z.roomId === a.roomId);
      const index = this.currentAgents().filter(x => x.roomId === a.roomId && x.coordinator).findIndex(x => x.id === a.id);
      return zone ? { x: zone.x + 22 + index * 22, y: zone.y + zone.h - 18 } : undefined;
    }
    const residents = this.currentAgents().filter(x => x.roomId === a.roomId && !x.coordinator);
    const idx = residents.findIndex(x => x.id === a.id);
    return this.seats.get(idx === 0 ? a.roomId : `${a.roomId}:preview:${idx}`) ?? this.seats.get(a.roomId);
  }

  private stepCoordinator(a: AgentDTO, sprite: AgentSprite, w: Worker, dt: number) {
    if (!this.layout) return;
    const station = a.cliActive ? this.layout.stations.find(s => s.station.id === a.targetStationId) : null;
    const home = this.coordinatorHomes.get(a.id)!;
    const key = station?.station.id ?? 'home';
    let style = this.dispatchStyles.get(a.id) ?? 'visit';
    if (this.coordinatorGoals.get(a.id) !== key) {
      for (const [id, owner] of this.pendingVisits) if (owner === a.id) this.pendingVisits.delete(id);
      style = deliveryMode(`${a.id}:${key}:${a.lastActivity ?? ''}`);
      this.dispatchStyles.set(a.id, style);
      const recipient = station ? [...this.workers.entries()].find(([id]) => id !== a.id && this.state.agents.find(agent=>agent.id===id)?.deskId === station.station.id && !this.state.agents.find(agent=>agent.id===id)?.coordinator)?.[1] : null;
      const position = recipient ? {x:Math.round(recipient.pos.x),y:Math.round(recipient.pos.y)} : null;
      const visitGoal = position && this.layout.grid[position.y]?.[position.x] ? position : station?.access;
      const goal = station && style === 'visit' ? visitGoal! : home;
      w.path = findPath(this.layout.grid, { x: Math.round(w.pos.x), y: Math.round(w.pos.y) }, goal) ?? [];
      this.coordinatorGoals.set(a.id, key);
      if (station) {
        sprite.say(`${style === 'phone' ? 'Telefon' : style === 'message' ? 'Mesaj' : 'Yanına gidiyorum'} → ${station.station.name}`, true, 4500, 'İş dağıtımı');
        if (style === 'visit' && w.path.length) this.pendingVisits.set(station.station.id, a.id);
        else this.notifyStation(a, station.station.id, style);
      }
    }
    let budget = dt * 4;
    while (budget > 0 && w.path.length) {
      const p = w.path[0]!, dx = p.x - w.pos.x, dy = p.y - w.pos.y, distance = Math.hypot(dx, dy);
      w.dir = Math.abs(dx) > Math.abs(dy) ? dx < 0 ? 'left' : 'right' : dy < 0 ? 'up' : 'down';
      if (distance <= budget) { w.pos = { ...p }; w.path.shift(); budget -= distance; }
      else { w.pos.x += dx / distance * budget; w.pos.y += dy / distance * budget; budget = 0; }
    }
    const wasWalking = w.mode === 'walking';
    w.mode = w.path.length ? 'walking' : 'doing';
    const ordinal = this.currentAgents().filter(x => x.coordinator).findIndex(x => x.id === a.id);
    const seat = (key === 'home' || style !== 'visit') && !w.path.length ? this.seats.get(`coordination:${a.roomId}:${ordinal}`) : null;
    sprite.setFeet(seat?.x ?? w.pos.x * T + T / 2, seat?.y ?? w.pos.y * T + T);
    sprite.setVisual(w.mode === 'walking' ? 'walk' : a.cliActive ? style === 'phone' ? 'sofa' : seat ? 'work' : 'think' : seat ? 'work' : 'visit', w.dir);
    if (wasWalking && w.mode !== 'walking' && station && style === 'visit') this.notifyStation(a, station.station.id, style);
  }

  private notifyStation(coordinator: AgentDTO, stationId: string, mode: DeliveryMode) {
    this.pendingVisits.delete(stationId);
    this.incoming.set(stationId, { until: this.time.now + (mode === 'visit' ? 900 : 2200), mode });
    const target = this.state.agents.find(a => !a.coordinator && a.roomId === coordinator.roomId && a.deskId === stationId);
    const recipient = target && this.agents.get(target.id);
    recipient?.say(`${mode === 'phone' ? 'Arama geldi' : mode === 'message' ? 'Mesaj geldi' : 'Görevi aldım'} · masama geçiyorum.`, true, 4200, 'Görev bildirimi');
    const sender = this.agents.get(coordinator.id);
    const seat = this.seats.get(stationId);
    if (!sender || !seat) return;
    const packet = this.add.text(sender.x, sender.y - 22, mode === 'phone' ? '☎' : '✉', {fontSize:'13px',color:'#a5f0ca',backgroundColor:'#283e37'}).setDepth(5000);
    this.objects.push(packet);
    this.tweens.add({targets:packet,x:recipient?.x ?? seat.x,y:(recipient?.y ?? seat.y)-25,duration:mode==='visit'?500:1100,onComplete:()=>{packet.destroy();this.objects=this.objects.filter(o=>o!==packet);}});
  }

  // Overview residents take short aisle breaks inside their own office. This is ambient life,
  // independent of tool activity; it never changes the server's actual working status.
  private animateFloorLife(time: number) {
    for (const a of this.currentAgents()) {
      if (a.id.startsWith('manager:')) continue;
      const s = this.agents.get(a.id);
      const seat = this.floorSeat(a);
      const zone = this.zones.find(z => z.roomId === a.roomId);
      if (!s || !seat || !zone) continue;
      if (a.status === 'working' || a.status === 'thinking') { s.setFeet(seat.x, seat.y); this.applyFloorVisual(a, s); continue; }
      const seed = [...a.id].reduce((n, c) => n + c.charCodeAt(0), 0);
      const phase = ((time / 1000 + seed) % 42);
      if (phase < 19 || phase > 37) { s.setFeet(seat.x, seat.y); s.setVisual('work'); continue; }
      // Exit north of the desk, walk along its aisle, pause, then retrace the same path.
      const idx = this.indexInRoom(a);
      const targetX = Math.max(zone.x + 20, Math.min(zone.x + zone.w - 20, seat.x + (idx % 2 ? -25 : 25)));
      const aisleY = Math.max(zone.y + 45, seat.y - 29);
      const progress = phase < 23 ? (phase - 19) / 4 : phase > 33 ? (37 - phase) / 4 : 1;
      const corner = Math.min(1, progress * 2);
      const along = Math.max(0, progress * 2 - 1);
      s.setFeet(seat.x + (targetX - seat.x) * along, seat.y + (aisleY - seat.y) * corner);
      s.setVisual(progress < 1 ? 'walk' : 'visit', phase > 33 ? 'down' : 'up');
      if (phase >= 25 && phase < 25.12) { const line = pickLine(a.roomId, idx % 2 ? 'coffee' : 'window', a.name, undefined, () => this.rand()); if (line) s.say(line.text); }
    }
  }

  private rand(): number {
    this.rngState = (Math.imul(this.rngState, 1664525) + 1013904223) >>> 0;
    return this.rngState / 4294967296;
  }

  // ---------- props that animate ----------

  private animateMonitors() {
    this.tick++;
    const { view, activity, live } = this.state;
    if (!view) return;
    const now = Date.now();
    for (const m of this.monitors) {
      let state = 'off';
      if (view.kind === 'master') state = this.state.masterBusy ? 'think' : 'idle';
      else if (view.kind === 'floor') {
        const a = this.state.agents.find((x) => x.roomId === m.roomId);
        state = a ? ({ working: 'code', thinking: 'think', completed: 'done', error: 'error', offline: 'off', idle: 'idle' } as Record<string, string>)[a.status] ?? 'idle' : 'off';
      } else if (m.roomId?.startsWith('coordination:')) {
        const ordinal = Number(m.roomId.split(':').at(-1));
        state = this.currentAgents().filter(a => a.coordinator)[ordinal]?.cliActive ? 'code' : 'idle';
      } else if (m.stationId) {
        const room = this.state.projects?.floors.flatMap((f) => f.rooms).find((r) => r.id === view.roomId);
        const lv = room ? live[room.id] : undefined;
        const st = stationStatus(m.stationId, activity?.rooms?.[view.roomId], lv?.stationId ?? null, now);
        const occupant = this.currentAgents().find((a) => a.deskId === m.stationId && this.workers.get(a.id)?.stationId === m.stationId);
        state = st.hot ? (occupant?.waiting || occupant?.status === 'thinking' ? 'think' : 'code') : st.dust >= 2 ? 'off' : 'idle';
        if (occupant?.status === 'error') state = 'error';
        if (occupant?.status === 'completed') state = 'done';
      }
      const frames = MONITOR_FRAMES[state] ?? 1;
      m.sprite.setFrame(`monitor_${state}_${this.tick % frames}`);
    }
  }

  // hide sprites far outside the camera: fewer draw calls with many agents and props
  private cull() {
    const view = this.cameras.main.worldView;
    const pad = 48;
    for (const o of this.objects) {
      const s = o as Phaser.GameObjects.Sprite;
      s.setVisible(s.x > view.x - pad && s.x < view.right + pad && s.y > view.y - pad && s.y < view.bottom + pad + 48);
    }
  }

  // ---------- pointer ----------

  private agentAt(wx: number, wy: number): AgentSprite | null {
    let best: AgentSprite | null = null;
    for (const a of this.agents.values()) if (a.container.visible && a.hit(wx, wy) && (!best || a.y > best.y)) best = a;
    return best;
  }

  private onPointerMove(p: Phaser.Input.Pointer) {
    if (p.isDown) return;
    const w = this.cameras.main.getWorldPoint(p.x, p.y);
    const hit = this.agentAt(w.x, w.y);
    const id = hit?.id ?? null;
    if (id !== this.hoverId) {
      if (this.hoverId) this.agents.get(this.hoverId)?.setHovered(false);
      hit?.setHovered(true);
      this.hoverId = id;
      this.input.setDefaultCursor(id ? 'pointer' : this.zoneAt(w.x, w.y) ? 'pointer' : 'default');
    }
    this.bridge.onAgentHover(id, id ? { x: p.x, y: p.y } : null);
  }

  private zoneAt(wx: number, wy: number) {
    if (this.state.view?.kind !== 'floor') return null;
    return this.zones.find((z) => z.kind === 'project' && wx >= z.x && wx < z.x + z.w && wy >= z.y && wy < z.y + z.h) ?? null;
  }

  private onPointerUp(p: Phaser.Input.Pointer) {
    if (this.cam.wasDrag || p.getDuration() > 500) return;
    const w = this.cameras.main.getWorldPoint(p.x, p.y);
    const hit = this.agentAt(w.x, w.y);
    if (hit) return this.bridge.onAgentClick(hit.id);
    if (this.state.view?.kind === 'master') {
      const z = this.zones[0];
      if (z && w.x >= z.x && w.x < z.x + z.w && w.y >= z.y && w.y < z.y + z.h) this.bridge.onAgentClick(MASTER_ID);
      return;
    }
    if (this.state.view?.kind === 'floor') {
      const z = this.zoneAt(w.x, w.y);
      return z ? this.bridge.onRoomClick(z.roomId) : this.bridge.onBackgroundClick();
    }
    for (const [id, c] of this.cells) if (w.x >= c.x && w.x < c.x + c.w && w.y >= c.y - 4 && w.y < c.y + c.h) return this.bridge.onStationClick(id);
    this.bridge.onStationClick(null);
    this.bridge.onBackgroundClick();
  }

  // ---------- signs: which floor, which room, which project (bird's-eye information) ----------

  /**
   * A plate. `y` is its top edge, or its bottom edge when `bottom` is set (a lintel above a door). When the camera is
   * zoomed out the plate is scaled up so it stays readable, but never wider than `capW` (its own office).
   */
  private makeSign(cx: number, y: number, maxW: number, roomId: string, kind: string, o: { bottom?: boolean; capW?: number } = {}) {
    const title = this.add.text(0, 2, '', { fontFamily: FONT, fontSize: '8px', color: '#ffffff' }).setOrigin(0.5, 0).setResolution(4);
    const sub = this.add.text(0, 11, '', { fontFamily: FONT, fontSize: '6px', color: '#9a9db8' }).setOrigin(0.5, 0).setResolution(4);
    const bg = this.add.graphics();
    const box = this.add.container(cx, y, [bg, title, sub]).setDepth(o.bottom ? y : 5000);
    let width = 40;
    const sign = {
      roomId,
      kind,
      layout: (t: string, s: string, tone: string) => {
        let text = t.toUpperCase();
        title.setText(text);
        while (title.width > maxW - 10 && text.length > 3) {
          text = text.slice(0, -2);
          title.setText(`${text}…`);
        }
        sub.setText(s).setColor(tone).setVisible(!!s);
        const w = Math.min(maxW, Math.ceil(Math.max(title.width, s ? sub.width : 0)) + 10);
        const h = s ? 19 : 12;
        const top = o.bottom ? -h : 0;
        width = w;
        title.setY(top + 2);
        sub.setY(top + 11);
        bg.clear();
        bg.fillStyle(0x151624, 0.95).fillRect(-w / 2, top, w, h);
        bg.lineStyle(1, this.accent, 1).strokeRect(-w / 2 + 0.5, top + 0.5, w - 1, h - 1);
        bg.fillStyle(0x3a3a50, 1).fillRect(-w / 2 + 1, top + h - 1, w - 2, 1);
      },
      rescale: (zoom: number) => {
        const want = Math.min(2.4, Math.max(1, 0.95 / zoom));
        const cap = o.capW ? Math.max(1, (o.capW - 6) / width) : want;
        box.setScale(Math.min(want, cap));
      },
      destroy: () => box.destroy(true),
    };
    this.signs.push(sign);
    return sign;
  }

  private buildSigns(floor: Floor) {
    this.accent = themeOf(floor.id, this.state.projects?.floors.findIndex((f) => f.id === floor.id) ?? 0).accent;
    for (const sg of this.signs) sg.destroy();
    this.signs = [];
    for (const b of this.banner) b.destroy();
    this.banner = [];
    const { view } = this.state;
    if (view?.kind === 'master') return;
    if (view?.kind === 'floor') {
      for (const z of this.zones) {
        if (z.kind === 'elevator' || z.kind === 'stairs') {
          // the floor plaque hangs next to the elevator; a small plate marks the stairs
          this.makeSign(z.x + z.w / 2, z.y, z.w, z.roomId, z.kind);
        } else {
          // the plate hangs on the top wall of the office
          this.makeSign(z.x + z.w / 2, z.y + 3, z.w - 6, z.roomId, z.kind, { capW: z.w });
        }
      }
      if (this.corridor && !this.zones.some((z) => z.kind === 'elevator')) {
        // no free wall for the elevator on this floor: a painted banner in the corridor instead
        const c = this.corridor;
        const t = this.add.text(c.x + c.w * 0.72, c.y + 18, `${floor.name.toUpperCase()} KATI`, { fontFamily: FONT, fontSize: '14px', color: '#23243a' }).setOrigin(0.5, 0).setResolution(4).setAlpha(0.8).setDepth(0.6);
        const sub = this.add.text(c.x + c.w * 0.72, c.y + 36, '', { fontFamily: FONT, fontSize: '8px', color: '#23243a' }).setOrigin(0.5, 0).setResolution(4).setAlpha(0.75).setDepth(0.6);
        this.banner.push(t, sub);
        this.bannerSub = sub;
      }
    } else if (view?.kind === 'room' && this.layout) {
      this.makeSign((this.layout.tilesW * T) / 2, 3, this.layout.tilesW * T - 24, view.roomId, 'room');
    }
    this.updateSigns();
  }

  private refreshSigns() {
    const floor = this.state.projects?.floors.find((f) => f.id === this.state.view?.floorId);
    if (floor && this.mapKey) this.buildSigns(floor);
  }

  private bannerSub: Phaser.GameObjects.Text | null = null;

  private updateSigns() {
    const { view, agents, projects } = this.state;
    if (!view || !projects || view.kind === 'master') return;
    const floor = projects.floors.find((f) => f.id === view.floorId);
    if (view.kind === 'floor' && floor) {
      this.bannerSub?.setText(`${floor.rooms.length} ofis · ${agents.filter((a) => a.floorId === floor.id).length} ajan`);
    }
    for (const sg of this.signs) {
      const room = floor?.rooms.find((r) => r.id === sg.roomId);
      const here = agents.filter((a) => a.roomId === sg.roomId);
      const active = here.filter((a) => a.status === 'working' || a.status === 'thinking').length;
      const errors = here.filter((a) => a.status === 'error').length;
      const asleep = here.length > 0 && here.every((a) => a.status === 'offline');
      if (sg.kind === 'stairs') {
        sg.layout('Merdiven', '', '#9a9db8');
      } else if (sg.kind === 'elevator' && floor) {
        const here = agents.filter((a) => a.floorId === floor.id);
        const act = here.filter((a) => a.status === 'working' || a.status === 'thinking').length;
        sg.layout(`${floor.name} katı`, `${floor.rooms.length} ofis · ${here.length} ajan · ${act} aktif`, act ? '#7be0a3' : '#9a9db8');
      } else if (sg.kind === 'project' && room) {
        const tone = errors ? '#ff8a8a' : active ? '#7be0a3' : asleep ? '#8d8dac' : '#9a9db8';
        sg.layout(room.name, `${here.length} ajan · ${errors ? `${errors} hata` : asleep ? 'uyuyor' : `${active} aktif`}`, tone);
      } else if (sg.kind === 'room' && room && floor) {
        sg.layout(`${floor.name} › ${room.name}`, `${here.length} ajan · ${room.stations.length} istasyon · ${active} aktif`, active ? '#7be0a3' : '#9a9db8');
      } else {
        const z = this.zones.find((x) => x.roomId === sg.roomId);
        sg.layout(z ? String(z.name) : '', '', '#9a9db8');
      }
    }
    this.signZoom = 0; // force a rescale on the next frame (plate widths changed)
  }

  // ---------- commands from the UI ----------

  focusAgent(id: string) {
    const a = this.agents.get(id);
    if (a) this.cam.focusOn(a.x, a.y - 16, 3);
  }
  focusStation(id: string) {
    const c = this.cells.get(id);
    if (c) this.cam.focusOn(c.x + c.w / 2, c.y + c.h / 2, 3);
  }
  zoomStep(dir: 1 | -1) {
    this.cam.stepZoom(dir);
  }
  resetZoom() {
    this.cam.fit(true);
  }
  // read-only snapshot for tests and debugging (exposed as window.__office in the browser)
  debugInfo() {
    return {
      view: this.state.view,
      mapKey: this.mapKey,
      zoom: this.cameras.main.zoom,
      agents: [...this.agents.entries()].map(([id, a]) => ({ id, x: a.x, y: a.y, sx: (a.x - this.cameras.main.worldView.x) * this.cameras.main.zoom, sy: (a.y - 14 - this.cameras.main.worldView.y) * this.cameras.main.zoom, visible: a.container.visible, depth: a.container.depth, alpha: a.container.alpha, parts: a.container.list.map((o) => { const g = o as Phaser.GameObjects.Sprite; return { type: g.type, visible: g.visible, alpha: g.alpha, tex: g.texture?.key, frame: g.frame?.name, w: g.width, h: g.height }; }) })),
      workers: [...this.workers.entries()].map(([id, w]) => ({ id, mode: w.mode, station: w.stationId, doing: w.doing })),
      seats: this.seats.size,
      objects: this.objects.length,
    };
  }
  agentPosition(id: string) {
    const a = this.agents.get(id);
    return a ? { x: Math.round(a.x), y: Math.round(a.y) } : null;
  }
}

export type { Floor, Room };
