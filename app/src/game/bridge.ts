import type { AgentDTO, LiveSession, ManagerDTO, OfficeSnapshot, Projects } from '../types';

// The contract between the game and the outside world. The game never imports the store or React;
// it receives a HostState and reports what the user did through the bridge.

export type View = { kind: 'master'; floorId: null } | { kind: 'floor'; floorId: string } | { kind: 'room'; floorId: string; roomId: string };

export interface HostState {
  effectsEnabled?: boolean;
  connection?: 'connecting' | 'live' | 'reconnecting' | 'offline';
  observations?: OfficeSnapshot['observations'];
  projects: Projects | null;
  floorAspect: number;
  master: ManagerDTO | null;
  managers: ManagerDTO[];
  masterBusy: boolean;
  masterSpeech: string;
  view: View | null;
  agents: AgentDTO[];
  activity: OfficeSnapshot['activity'] | null;
  live: Record<string, LiveSession>;
  selectedAgentId: string | null;
  selectedStationId: string | null;
}

export interface AmbientConversation {
  id: string;
  /** screen position (px, viewport) of the speakers when the popup was opened; the popup sits next to it */
  anchor?: { x: number; y: number };
  participants: {id:string;name:string}[];
  turns: {speakerId:string;text:string}[];
  active: boolean;
  sourceUrl?: string;
  source?: import('../services/dialogues').DialogueSource;
}

export interface GameBridge {
  onConversation?(data: AmbientConversation | null, open?: boolean): void;
  onReady(): void;
  onAgentClick(id: string): void;
  onAgentHover(id: string | null, screen: { x: number; y: number } | null): void;
  onRoomClick(roomId: string): void;
  onStationClick(stationId: string | null): void;
  onBackgroundClick(): void;
  onZoom(zoom: number): void;
  onMoving(ids: string[]): void;
}

export const emptyState = (): HostState => ({ projects: null, floorAspect: 1.7, master: null, managers: [], masterBusy: false, masterSpeech: '', view: null, agents: [], activity: null, live: {}, selectedAgentId: null, selectedStationId: null });
