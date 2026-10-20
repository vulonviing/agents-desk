import { useEffect, useRef } from 'react';
import { emptyState, type GameBridge, type HostState } from '../game/bridge';
import { gameApi } from '../game/gameApi';
import { GameHost } from '../game/GameHost';
import { useManagers } from '../stores/managersStore';
import { useAmbientConversation } from '../stores/ambientConversationStore';
import { AmbientConversationPopup } from './Chat/AmbientConversationPopup';
import { useOffice } from '../stores/officeStore';

function hostState(): HostState {
  const s = useOffice.getState();
  const view = s.inMaster ? ({ kind: 'master', floorId: null } as const) : s.roomId && s.floorId ? ({ kind: 'room', floorId: s.floorId, roomId: s.roomId } as const) : s.floorId ? ({ kind: 'floor', floorId: s.floorId } as const) : null;
  return { ...emptyState(), projects: s.projects, view, effectsEnabled: s.effectsEnabled, connection: s.connection, master: s.office?.managers?.find((m) => m.kind === 'master') ?? null, masterBusy: useManagers.getState().busyManagerId === 'manager:master', masterSpeech: useManagers.getState().threads['manager:master']?.messages.filter((m) => m.role === 'assistant').at(-1)?.text ?? '', managers: s.office?.managers ?? [], agents: s.office?.agents ?? [], observations: s.office?.observations ?? [], activity: s.office?.activity ?? null, live: s.office?.live ?? {}, selectedAgentId: s.selectedAgentId, selectedStationId: s.selectedStationId };
}

const bridge: GameBridge = {
  onReady() {},
  onConversation: (data,open) => useAmbientConversation.getState().receive(data,open),
  onAgentClick(id) {
    if (id.startsWith('manager:')) { useOffice.getState().selectManager(id); return; }
    useOffice.getState().selectAgent(id);
    gameApi.host?.focusAgent(id);
  },
  onAgentHover(id, screen) {
    const cur = useOffice.getState().hover;
    if (!id || !screen) return cur ? useOffice.getState().setHover(null) : undefined;
    if (cur && cur.id === id && Math.abs(cur.x - screen.x) < 3 && Math.abs(cur.y - screen.y) < 3) return;
    useOffice.getState().setHover({ id, x: screen.x, y: screen.y });
  },
  onRoomClick: (roomId) => useOffice.getState().enterRoom(roomId),
  onStationClick(id) {
    useOffice.getState().selectStation(id);
    if (id) gameApi.host?.focusStation(id);
  },
  onBackgroundClick() {
    const s = useOffice.getState();
    if (s.selectedAgentId) s.selectAgent(null);
  },
  onZoom: (z) => useOffice.getState().setZoom(z),
  onMoving: (ids) => useOffice.getState().setMoving(ids),
};

// The Phaser game is created once and lives outside React's render cycle; state changes are pushed in.
export function GameCanvas() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = new GameHost(ref.current!, bridge);
    gameApi.host = host;
    (window as unknown as { __office?: GameHost }).__office = host;
    host.setState(hostState());
    const unsub = useOffice.subscribe((s, prev) => {
      if (s.effectsEnabled !== prev.effectsEnabled || s.connection !== prev.connection || s.inMaster !== prev.inMaster || s.projects !== prev.projects || s.office !== prev.office || s.floorId !== prev.floorId || s.roomId !== prev.roomId || s.selectedAgentId !== prev.selectedAgentId || s.selectedStationId !== prev.selectedStationId) {
        host.setState(hostState());
      }
    });
    const unsubManagers = useManagers.subscribe((s, prev) => {
      if (s.busy !== prev.busy || s.threads !== prev.threads) host.setState(hostState());
    });
    return () => {
      unsubManagers();
      unsub();
      host.destroy();
      gameApi.host = null;
    };
  }, []);
  return <><div ref={ref} className="game" /><AmbientConversationPopup /></>;
}
