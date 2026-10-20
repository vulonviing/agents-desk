import { useEffect } from 'react';
import { AgentTooltip } from './components/AgentPanel/AgentTooltip';
import { ChatPanel } from './components/Chat/ChatPanel';
import { GameCanvas } from './components/GameCanvas';
import { GameControls } from './components/GameControls/GameControls';
import { OfficeHUD } from './components/OfficeHUD/OfficeHUD';
import { DockPanel } from './components/RoomPanel/DockPanel';
import { useOffice } from './stores/officeStore';

export function App() {
  const inMaster = useOffice((s) => s.inMaster);
  const hasData = useOffice((s) => !!s.projects);
  const connection = useOffice((s) => s.connection);
  const panelOpen = useOffice((s) => s.panelOpen);
  const roomId = useOffice((s) => s.roomId);
  const chatAgentId = useOffice((s) => s.chatAgentId);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const s = useOffice.getState();
      if (s.selectedManagerId) s.selectManager(null);
      else if (s.selectedStationId) s.selectStation(null);
      else if (s.selectedAgentId) s.selectAgent(null);
      else if (s.roomId) s.leaveRoom();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className={`app ${inMaster ? 'master-mode' : ''} ${panelOpen ? 'with-dock' : ''} ${chatAgentId && !inMaster ? 'with-chat' : ''}`}>
      <OfficeHUD />
      <main className="stage">
        <div className="canvas-wrap">
          <GameCanvas />
          {!inMaster && <AgentTooltip />}
          <GameControls />
          <p className="hint">{inMaster ? 'konuşmak için Master’a ya da masasına tıkla · tekerlek: yakınlaş · sürükle: kaydır' : roomId ? 'tekerlek: yakınlaş · sürükle: kaydır · masaya ya da karaktere tıkla' : 'tekerlek: yakınlaş · sürükle: kaydır · ofise ya da karaktere tıkla'}</p>
          {!hasData && (
            <div className="overlay" role="status">
              {connection === 'offline' ? 'Sunucuya ulaşılamıyor. `npm run desk` çalışıyor mu?' : 'Ofis yükleniyor…'}
            </div>
          )}
        </div>
        {chatAgentId && !inMaster && <ChatPanel key={chatAgentId} agentId={chatAgentId} />}
        <DockPanel />
      </main>
    </div>
  );
}
