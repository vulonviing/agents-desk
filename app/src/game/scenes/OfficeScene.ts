import Phaser from 'phaser';
import type { AgentDTO, Floor, Room, Station } from '../../types';
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
import { createWorker, stepWorker, requestSpot, walkTo, type Worker } from '../systems/behavior';
import { deliveryMode, type DeliveryMode } from '../systems/dispatch';
import { findPath } from '../systems/pathfinding';
import { createAtmosphere, observeAtmosphere, printerState, skyAt } from '../systems/atmosphere';
import { ConversationDirector, type Participant } from '../systems/conversations';
import { floorWalkLayout } from '../systems/floorLife';
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
  private conversations = new ConversationDirector();
  private nextEncounter = 0;
  private walkLayout: RoomLayout | null = null;
  private floorMapData: TiledMap | null = null;
  private floorCells = new Map<string, { seat: { x: number; y: number }; access: { x: number; y: number } }>();
  private floorHomes = new Map<string, { x: number; y: number }>();
  private navKey = '';
  private stationGroups = new Map<string, string>();

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
  private conversationAgent: string | null = null;
  private conversationRevision = '';
  private nextAmbientAt = 0;
  private nextTalk = new Map<string, number>();
  private windows: Phaser.GameObjects.Sprite[] = [];
  private skyPhase = '';
  private transits = new Map<string, 'arriving' | 'leaving'>();
  private seenSessions = new Map<string, string>();
  private receiptPending = new Set<string>();
  private atmosphere = createAtmosphere();
  private atmosphereInk: Phaser.GameObjects.Graphics | null = null;
  private infoLabel: Phaser.GameObjects.Text | null = null;
  private clocks: Phaser.GameObjects.Sprite[] = [];
  private lastAtmosphereTick = -1;


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
    this.nextTalk.clear(); this.nextAmbientAt = 0;
    this.conversationAgent = null; this.conversationRevision = ''; this.bridge.onConversation?.(null);
    this.transits.clear(); this.seenSessions.clear(); this.receiptPending.clear();
    this.atmosphere = createAtmosphere(); this.atmosphereInk?.destroy(); this.atmosphereInk = null;
    this.infoLabel?.destroy(); this.infoLabel = null; this.clocks = []; this.lastAtmosphereTick = -1;
    this.windows = [];
    this.skyPhase = '';
    for (const a of this.agents.values()) a.destroy();
    this.agents.clear();
    this.workers.clear(); this.conversations.clear(); this.nextEncounter = 0;
    this.walkLayout = null; this.floorMapData = null; this.floorCells.clear(); this.floorHomes.clear(); this.navKey = ''; this.stationGroups.clear();
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
    const phase = skyAt(hour);
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
    this.floorMapData = view.kind === 'floor' ? result.map : null;
    this.materialize(result.map, result.worldW, result.worldH);
    this.buildSigns(floor);
    for (const z of this.layout?.openPlan ? [] : this.layout?.departments ?? []) {
      const text = this.add.text((z.x + z.w / 2) * T, (z.y === 0 ? 3 : z.y + 0.6) * T, `${/^\d$/.test(z.step) ? `${z.step} ▸ ` : ''}${z.name}`, { fontFamily: FONT, fontSize: '9px', color: '#fff8e8', backgroundColor: '#303044', padding: { x: 4, y: 2 } }).setOrigin(0.5, 0).setResolution(4).setDepth(1000);
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
      if (p.frame === 'clock') this.clocks.push(s);
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
    for (const o of layer('desks')) {
      const p=propsOf(o),id=String(p.roomId);
      this.seats.set(id, {x:o.x,y:o.y});
      if(typeof p.tx==='number' && typeof p.ty==='number')this.floorCells.set(id,{seat:{x:p.tx+2,y:p.ty},access:{x:p.tx+2,y:p.ty-1}});
    }
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

  private syncAgents() {
    const want = this.currentAgents();
    const ids = new Set(want.map((a) => a.id));
    for (const [id, sprite] of this.agents) {
      if (!ids.has(id)) {
        if (this.transits.get(id) === 'leaving') continue;
        const w = this.workers.get(id);
        const entry = this.entryTile();
        if (this.layout && w && entry && this.seenSessions.has(id) && walkTo(w, this.layout, entry, { kind: 'visit', id: 'exit' })) {
          sprite.setActive(false); this.transits.set(id, 'leaving'); continue;
        }
        sprite.destroy();
        this.agents.delete(id);
        this.workers.delete(id); this.nextTalk.delete(id); this.receiptPending.delete(id);
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
      if (this.transits.get(a.id) === 'leaving') this.transits.delete(a.id);
      if (a.sessionId && this.seenSessions.get(a.id) !== a.sessionId && this.layout) {
        this.seenSessions.set(a.id, a.sessionId);
        const w = this.workers.get(a.id), entry = this.entryTile();
        const goal = this.coordinatorHomes.get(a.id);
        if (w && entry && goal) {
          w.pos = entry;
          if (walkTo(w, this.layout, goal, { kind: 'visit', id: 'arrival' })) {
            this.transits.set(a.id, 'arriving'); s.setFeet(entry.x * T + T / 2, entry.y * T + T);
          }
        }
      }
      s.setActive(!!a.cliActive); if(a.waiting)s.clearAmbientSpeech();
      if (this.state.view?.kind === 'floor') this.applyFloorVisual(a, s);
    }
    this.syncWalkLayout(want);
  }

  private visualOf(a: AgentDTO): Visual {
    if (a.waiting) return 'wait';
    if (a.cliActive && /^(Read|Grep|Glob)$/.test(a.observation?.tool ?? '')) return 'read';
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
        w.home = `@coord:${a.id}`; w.pos = { x, y: home.y }; w.mode = 'doing'; w.stationId = null; w.doing = 'visit'; w.path = [];
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
      if (event.kind === 'completed' || event.kind === 'error') {
        observeAtmosphere(this.atmosphere, event.kind, this.time.now);
        const actor = this.state.agents.find(a => a.roomId === roomId && (a.id === event.coordinatorId || !!event.sessionId && a.coordinator && a.sessionId === event.sessionId)) ?? destination;
        if (actor) {
          this.agents.get(actor.id)?.say(event.kind === 'completed' ? 'Tur tamamlandı.' : 'Tur kesildi.', true);
          if (event.kind === 'completed') this.receiptPending.add(actor.id);
        }
        continue;
      }
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
    if (document.hidden) return;
    const zoom = this.cameras.main.zoom;
    if (Math.abs(zoom - this.signZoom) > 0.01) {
      this.signZoom = zoom;
      for (const sg of this.signs) sg.rescale(zoom);
    }
    this.updateSky();
    this.updateAtmosphere();
    for (const s of this.agents.values()) s.updateSpeech();
    this.stepConversations();
    if (this.state.view?.kind === 'floor') { this.animateFloorLife(Math.min(0.1, delta / 1000)); return; }
    if (this.state.view?.kind !== 'room' || !this.layout) return;
    const dt = Math.min(0.1, delta / 1000);
    this.stepTransits(dt);
    const moving: string[] = [];
    const occupants = [...this.workers.values()];
    const busyIds = new Set(this.currentAgents().filter(a => a.cliActive || a.waiting).map(a => a.id));
    for (const a of this.currentAgents()) {
      const s = this.agents.get(a.id);
      const w = this.workers.get(a.id);
      if (!s || !w) continue;
      if (this.conversations.holds(a.id)) { this.poseConversation(a.id, s, w); continue; }
      if (this.transits.has(a.id)) { moving.push(a.id); continue; }
      if (this.receiptPending.has(a.id) && !a.cliActive && !a.waiting) {
        if (requestSpot(w, 'printer', { layout: this.walkLayout ?? this.layout, demand: null, sleeping: false, rng: () => this.rand(), workers: occupants })) this.receiptPending.delete(a.id);
      }
      if (a.cliActive || a.waiting) {
        this.receiptPending.delete(a.id);
        if (a.coordinator && (w.target?.kind === 'printer' || w.target?.kind === 'queue' || w.doing === 'printer' || w.doing === 'queue')) {
          w.path = []; w.target = null; w.doing = null; this.coordinatorGoals.delete(a.id);
        }
      }
      if (a.coordinator && (w.target?.kind === 'printer' || w.doing === 'printer' || w.doing === 'queue' || w.target?.kind === 'queue') && !a.cliActive && !a.waiting) {
        const before = w.mode;
        stepWorker(w, dt, { layout: this.walkLayout ?? this.layout, demand: null, sleeping: false, rng: () => this.rand(), workers: occupants });
        s.setFeet(w.pos.x * T + T / 2, w.pos.y * T + T);
        s.setVisual(w.mode === 'walking' ? 'walk' : w.doing === 'printer' ? 'printer' : 'queue', w.dir);
        if (before === 'doing' && w.mode !== 'doing') { w.path = []; w.target = null; w.doing = null; this.coordinatorGoals.delete(a.id); }
        continue;
      }
      if (a.coordinator) { this.stepCoordinator(a, s, w, dt); if (w.mode === 'walking') moving.push(a.id); continue; }
      if (a.deskId && this.pendingVisits.has(a.deskId)) { s.setVisual('visit'); continue; }
      const notice = a.deskId ? this.incoming.get(a.deskId) : null;
      if (notice && notice.until > this.time.now) { s.setVisual(notice.mode === 'visit' ? 'visit' : 'sofa'); continue; }
      const delegated = this.currentAgents().some(c => c.coordinator && c.cliActive && c.targetStationId === a.deskId);
      const working = !!a.cliActive || a.waiting || delegated || a.status === 'completed' || a.status === 'error';
      const previousMode = w.mode;
      stepWorker(w, dt, { layout: this.walkLayout ?? this.layout, demand: working ? a.deskId : null, sleeping: false, rng: () => this.rand(), workers: occupants, busyIds, groupOf: id => this.stationGroups.get(id) });
      if (w.mode === 'doing' && previousMode !== 'doing' && w.doing !== 'queue' && w.doing !== 'printer') {
        const neighbor = w.doing === 'visit' ? [...this.workers.values()].find(other => other.id !== w.id && other.stationId === w.spotId) : null;
        // ambient talk comes from the office's dialogue pool (picked locally, no model call per line)
        const officeId = this.state.view?.kind === 'room' ? this.state.view.roomId : a.roomId;
        const nb = neighbor ? this.state.agents.find(x => x.id === neighbor.id) : undefined;
        if (nb) {
          this.tryConversation(a.id, nb.id);
        } else {
          const kind: LineKind = w.doing === 'coffee' ? 'coffee' : w.doing === 'cooler' ? 'water' : w.doing === 'window' ? 'window' : w.doing === 'sofa' ? 'news' : 'desk';
          const line = this.ambientLine(officeId, kind, a.name, undefined, () => this.rand());
          if (line) s.say(line.text, false, 5500, undefined, line.source?.url);
        }
      }
      // now and then a resident at an idle desk thinks aloud (ambient only, never real work)
      if (w.mode === 'seated' && !working) {
        const due = this.nextTalk.get(a.id);
        if (due === undefined) this.nextTalk.set(a.id, this.time.now + 15000 + this.rand() * 30000);
        else if (this.time.now > due) {
          const line = this.ambientLine(a.roomId, 'desk', a.name, undefined, () => this.rand());
          if (line) s.say(line.text, false, 5500, undefined, line.source?.url);
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
    this.encounterNearby();
    const key = moving.sort().join(',');
    if (key !== this.movingKey) {
      this.movingKey = key;
      this.bridge.onMoving(moving);
    }
  }

  private syncWalkLayout(actors: AgentDTO[]) {
    const key=actors.map(a=>a.id).join('|');
    if(key===this.navKey&&this.walkLayout)return;
    this.navKey=key;this.stationGroups.clear();
    if(this.floorMapData){
      const homes=actors.flatMap(a=>{
        const feet=this.floorSeat(a);if(!feet)return [];
        const idx=actors.filter(o=>o.roomId===a.roomId&&!o.coordinator).findIndex(o=>o.id===a.id);
        const cell=this.floorCells.get(idx===0?a.roomId:`${a.roomId}:preview:${idx}`);
        this.floorHomes.set(a.id,feet);this.stationGroups.set(a.id,a.roomId);
        const seat=a.coordinator||!cell?{x:Math.round(feet.x/T-0.5),y:Math.round(feet.y/T-1)}:cell.seat;
        return [{id:a.id,seat,access:a.coordinator||!cell?seat:cell.access}];
      });
      this.walkLayout=floorWalkLayout(this.floorMapData,homes);
      for(const a of actors){
        if(!this.workers.has(a.id))this.workers.set(a.id,createWorker(a.id,this.walkLayout,a.id));
        if(a.coordinator){const seat=this.walkLayout.stations.find(s=>s.station.id===a.id)!.seat;this.floorHomes.set(a.id,{x:seat.x*T+T/2,y:seat.y*T+T});}
      }
    }else if(this.layout){
      for(const z of this.layout.departments)for(const station of z.stations)this.stationGroups.set(station.id,z.id);
      const coordination=actors.filter(a=>a.coordinator).flatMap(a=>{
        const home=this.coordinatorHomes.get(a.id);if(!home)return [];
        const id=`@coord:${a.id}`;this.stationGroups.set(id,'coordination');
        return [{station:{id} as Station,tx:home.x,ty:home.y,seat:home,access:home}];
      });
      this.walkLayout={...this.layout,stations:[...this.layout.stations,...coordination]};
    }
  }

  private talkActors() {
    const actors=new Map<string,Participant>();
    for(const a of this.currentAgents()){
      const w=this.workers.get(a.id);if(!w)continue;
      actors.set(a.id,{id:a.id,pos:w.pos,busy:!!a.cliActive||a.waiting||this.transits.has(a.id)||w.doing==='printer'||w.doing==='queue'});
    }
    return actors;
  }
  private tryConversation(aId:string,bId:string) {
    const actors=this.talkActors(),a=actors.get(aId),b=actors.get(bId);if(!a||!b||!this.conversations.canStart(a,b,this.time.now))return false;
    const first=this.state.agents.find(x=>x.id===aId),second=this.state.agents.find(x=>x.id===bId);if(!first||!second)return false;
    const scope=this.state.view?.kind==='floor'?`floor:${this.state.view.floorId}`:first.roomId;
    const exchange=this.ambientLine(scope,'visit',first.name,second.name,()=>this.rand());
    return !!exchange&&this.conversations.start(a,b,exchange,this.time.now);
  }
  private stepConversations() {
    const result=this.conversations.tick(this.time.now,this.talkActors());
    for(const speech of result.speeches)this.agents.get(speech.id)?.say(speech.text,false,speech.duration,undefined,speech.source?.url);
    if(this.conversationAgent)this.publishConversation(this.conversationAgent);
    for(const id of result.ended){this.agents.get(id)?.clearAmbientSpeech();const w=this.workers.get(id);if(w?.doing==='visit')w.timer=Math.min(w.timer,1);}
  }
  private publishConversation(agentId: string, open = false) {
    const record = this.conversations.transcriptFor(agentId);
    if (!record) return false;
    const revision = `${record.id}:${record.turns.length}:${record.active}`;
    if (open || revision !== this.conversationRevision) {
      this.conversationRevision = revision;
      this.bridge.onConversation?.({...record, turns:[...record.turns], participants:[record.a,record.b].map(id=>({id,name:this.state.agents.find(a=>a.id===id)?.name??'Sim'}))}, open);
    }
    return true;
  }

  private poseConversation(id:string,sprite:AgentSprite,w:Worker) {
    const partner=this.workers.get(this.conversations.partner(id)??'');
    const dx=partner?partner.pos.x-w.pos.x:0,dy=partner?partner.pos.y-w.pos.y:0;
    const dir=Math.abs(dx)>Math.abs(dy)?dx<0?'left':'right':dy<0?'up':'down';
    sprite.setVisual(w.mode==='seated'?'work':'visit',dir);
  }
  private encounterNearby() {
    if(this.time.now<this.nextEncounter)return;
    this.nextEncounter=this.time.now+1000+this.rand()*1600;
    const actors=[...this.talkActors().values()];
    const offset=Math.floor(this.rand()*Math.max(1,actors.length));
    for(let i=0;i<actors.length;i++){
      const a=actors[(i+offset)%actors.length]!;if(a.busy||this.conversations.holds(a.id))continue;
      for(const b of actors)if(this.conversations.canStart(a,b,this.time.now)&&this.rand()<0.3&&this.tryConversation(a.id,b.id))return;
    }
  }

  private ambientLine(...args: Parameters<typeof pickLine>) {
    if (this.time.now < this.nextAmbientAt) return null;
    const line = pickLine(...args);
    if (line) this.nextAmbientAt = this.time.now + 4000;
    return line;
  }

  private entryTile() {
    if (!this.layout) return null;
    const x = this.layout.door.x, y = 3;
    if (this.layout.grid[y]?.[x]) return { x, y };
    return this.layout.coordinatorDesks[0]?.access ?? this.layout.stations[0]?.access ?? null;
  }

  private stepTransits(dt: number) {
    if (!this.layout) return;
    for (const [id, kind] of this.transits) {
      const w = this.workers.get(id), sprite = this.agents.get(id);
      if (!w || !sprite) { this.transits.delete(id); continue; }
      stepWorker(w, dt, { layout: this.layout, demand: null, sleeping: false, rng: () => this.rand() });
      sprite.setFeet(w.pos.x * T + T / 2, w.pos.y * T + T); sprite.setVisual('walk', w.dir);
      if (w.mode === 'walking') continue;
      this.transits.delete(id);
      if (kind === 'leaving') {
        sprite.destroy(); this.agents.delete(id); this.workers.delete(id); this.nextTalk.delete(id); this.receiptPending.delete(id);
        this.coordinatorHomes.delete(id); this.coordinatorGoals.delete(id); this.seenSessions.delete(id);
      } else { this.coordinatorGoals.delete(id); w.doing = null; }
    }
  }

  private updateAtmosphere() {
    const tick = Math.floor(this.time.now / 150);
    if (tick === this.lastAtmosphereTick) return;
    this.lastAtmosphereTick = tick;
    const ink = this.atmosphereInk ??= this.add.graphics().setDepth(990);
    const label = this.infoLabel ??= this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '7px', color: '#f8f2df', backgroundColor: '#303044', padding: { x: 3, y: 2 } }).setResolution(4).setDepth(1000);
    ink.clear(); label.setVisible(false);
    if (this.state.effectsEnabled === false) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const time = new Date();
    // Clock hands report local wall time; no synthetic news or weather is displayed.
    for (const clock of this.clocks) {
      const x = clock.x, y = clock.y - 6;
      const hand = (angle: number, length: number) => { ink.lineStyle(1, 0x343442).lineBetween(x, y, Math.round(x + Math.sin(angle) * length), Math.round(y - Math.cos(angle) * length)); };
      hand(time.getMinutes() * Math.PI / 30, 4); hand((time.getHours() % 12 + time.getMinutes() / 60) * Math.PI / 6, 2);
    }
    if (this.layout && this.skyPhase !== 'day') {
      ink.fillStyle(0xffda8b, 0.1);
      for (const a of this.currentAgents()) if (a.cliActive || a.waiting) {
        const sprite = this.agents.get(a.id); if (sprite) ink.fillEllipse(sprite.x, sprite.y - 8, 30, 14);
      }
    }
    if (!reduced) for (const w of this.workers.values()) if (w.doing === 'coffee' && w.mode === 'doing') {
      const x = w.pos.x * T + 12, y = w.pos.y * T - 17 - tick % 5;
      ink.lineStyle(1, 0xf4e8cf, 0.6).lineBetween(x, y, x + 1, y - 4);
    }
    const printer = this.layout?.props.find(p => p.type === 'printer');
    if (printer) {
      const state = printerState(this.atmosphere, this.time.now), x = printer.tx * T, y = printer.ty * T;
      if (state !== 'idle') {
        ink.fillStyle(state === 'error' ? 0xf18b88 : 0xa2e8be).fillRect(x + 11, y + 5, 2, 2);
        if (state === 'done') ink.fillStyle(0xfff8e8).fillRect(x + 3, y + 12, 9, 5);
        label.setPosition(x - 20, y - 15).setText(state === 'done' ? '✔ Tur tamamlandı' : '⛔ Tur kesildi').setVisible(true);
      }
      if (!reduced && this.time.now < this.atmosphere.celebrationUntil) {
        ink.fillStyle(0xf1cf82);
        for (let i = 0; i < 6; i++) ink.fillRect(x - 12 + i * 6, y - 12 - (i * 3 + tick) % 12, 2, 2);
      }
    }
    if (this.state.connection === 'reconnecting' || this.state.connection === 'offline') {
      label.setPosition(this.cameras.main.worldView.centerX - 50, this.cameras.main.worldView.top + 12).setText('Bağlantı bekleniyor').setVisible(true);
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
    if (!a.cliActive && !a.waiting && this.coordinatorGoals.get(a.id) === 'ambient' && this.walkLayout) {
      const before=w.mode;
      stepWorker(w,dt,{layout:this.walkLayout,demand:null,sleeping:false,rng:()=>this.rand(),workers:[...this.workers.values()],busyIds:new Set(this.currentAgents().filter(a=>a.cliActive||a.waiting).map(a=>a.id)),groupOf:id=>this.stationGroups.get(id)});
      if(w.mode==='seated'){
        const ordinal=this.currentAgents().filter(x=>x.coordinator).findIndex(x=>x.id===a.id),seat=this.seats.get(`coordination:${a.roomId}:${ordinal}`);
        if(seat)sprite.setFeet(seat.x,seat.y);sprite.setVisual('work');
      }else{sprite.setFeet(w.pos.x*T+T/2,w.pos.y*T+T);sprite.setVisual(w.mode==='walking'?'walk':w.doing as Visual,w.dir);}
      if(w.mode==='doing'&&before!=='doing'){
        const other=[...this.workers.values()].find(o=>o.id!==w.id&&o.stationId===w.spotId);
        if(w.doing==='visit'&&other)this.tryConversation(w.id,other.id);
        else if(w.doing!=='queue'){const kind:LineKind=w.doing==='coffee'?'coffee':w.doing==='cooler'?'water':w.doing==='window'?'window':w.doing==='sofa'?'news':'desk';const line=this.ambientLine(a.roomId,kind,a.name,undefined,()=>this.rand());if(line)sprite.say(line.text,false,5000,undefined,line.source?.url);}
      }
      return;
    }
    if ((a.cliActive || a.waiting) && this.coordinatorGoals.get(a.id)==='ambient') {w.target=null;w.doing=null;w.path=[];}
    const station = a.cliActive || a.waiting ? this.layout.stations.find(s => s.station.id === a.targetStationId) : null;
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
    sprite.setVisual(w.mode === 'walking' ? 'walk' : a.waiting ? 'wait' : a.cliActive ? style === 'phone' ? 'sofa' : seat ? this.visualOf(a) : 'think' : seat ? 'work' : 'visit', w.dir);
    if (!a.cliActive && !a.waiting && !w.path.length && key==='home') {w.mode='seated';w.stationId=w.home;w.doing=null;w.target=null;w.timer=20+this.rand()*30;this.coordinatorGoals.set(a.id,'ambient');}
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
  private animateFloorLife(dt: number) {
    if(!this.walkLayout)return;
    const actors=this.currentAgents(),workers=[...this.workers.values()],busyIds=new Set(actors.filter(a=>a.cliActive||a.waiting).map(a=>a.id));
    const moving:string[]=[];
    for(const a of actors){
      const sprite=this.agents.get(a.id),w=this.workers.get(a.id);if(!sprite||!w)continue;
      if(this.conversations.holds(a.id)){this.poseConversation(a.id,sprite,w);continue;}
      const before=w.mode,busy=busyIds.has(a.id);
      stepWorker(w,dt,{layout:this.walkLayout,demand:busy?a.id:null,sleeping:false,rng:()=>this.rand(),workers,busyIds,groupOf:id=>this.stationGroups.get(id)});
      if(w.mode==='seated'){
        const seat=this.floorHomes.get(a.id);if(seat)sprite.setFeet(seat.x,seat.y);
        sprite.setVisual(busy?this.visualOf(a):'work');
      }else{
        const x=w.pos.x*T+T/2,y=w.pos.y*T+T;
        sprite.setFeet(sprite.x+(x-sprite.x)*0.45,sprite.y+(y-sprite.y)*0.45);
        sprite.setVisual(w.mode==='walking'?'walk':w.doing as Visual,w.dir);
        if(w.mode==='walking')moving.push(a.id);
      }
      if(w.mode==='doing'&&before!=='doing'&&w.doing!=='queue'){
        const other=workers.find(o=>o.id!==w.id&&o.stationId===w.spotId);
        if(w.doing==='visit'&&other)this.tryConversation(w.id,other.id);
        else {const kind:LineKind=w.doing==='coffee'?'coffee':w.doing==='window'?'window':w.doing==='sofa'?'news':'desk';const line=this.ambientLine(`floor:${a.floorId}`,kind,a.name,undefined,()=>this.rand());if(line)sprite.say(line.text,false,5000,undefined,line.source?.url);}
      }
    }
    this.encounterNearby();
    const key=moving.sort().join(',');if(key!==this.movingKey){this.movingKey=key;this.bridge.onMoving(moving);}
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
    if (hit) {
      if(this.publishConversation(hit.id,true)){this.conversationAgent=hit.id;return;}
      return this.bridge.onAgentClick(hit.id);
    }
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
      conversations: this.conversations.debug(),
      atmosphere: { sky: this.skyPhase, printer: printerState(this.atmosphere, this.time.now), enabled: this.state.effectsEnabled !== false },
      transits: [...this.transits],
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
