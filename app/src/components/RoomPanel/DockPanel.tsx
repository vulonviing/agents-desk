import { LEVEL_TEXT } from '../../lib/format';
import { selectRoom, useOffice, type PanelTab } from '../../stores/officeStore';
import { AgentPanel } from '../AgentPanel/AgentPanel';
import { ManagerPanel } from '../Managers/ManagerPanel';
import { ActivityTab } from './ActivityTab';
import { InfoTab } from './InfoTab';
import { SessionsTab } from './SessionsTab';

const TABS: [PanelTab, string][] = [['agent', 'Profil'], ['activity', 'Ajanlar'], ['sessions', 'Oturumlar'], ['info', 'Bilgi']];

// The right dock: the selected agent on a floor, or the room tabs when inside a room.
export function DockPanel() {
  const room = useOffice(selectRoom);
  const tab = useOffice((s) => s.panelTab);
  const agentId = useOffice((s) => s.selectedAgentId);
  const open = useOffice((s) => s.panelOpen);
  const managerId = useOffice((s) => s.selectedManagerId);
  const setTab = useOffice((s) => s.setTab);
  const leaveRoom = useOffice((s) => s.leaveRoom);
  if (!open) return null;
  if (managerId) return <aside className="dock manager-dock" aria-label="Yönetici paneli"><ManagerPanel key={managerId} managerId={managerId} /></aside>;

  if (!room) {
    return <aside className="dock">{agentId ? <AgentPanel agentId={agentId} /> : <p className="muted">Bir karaktere ya da ofise tıkla.</p>}</aside>;
  }
  return (
    <aside className="dock">
      <div className="room-head">
        <div>
          <h2>{room.name}</h2>
          <p className="muted">Ofis · {room.stations.length} istasyon · {LEVEL_TEXT[room.level]}</p>
        </div>
        <button type="button" onClick={leaveRoom}>← Kata dön</button>
      </div>
      <div className="tabs" role="tablist">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      <div className="body">
        {tab === 'agent' && (agentId ? <AgentPanel agentId={agentId} /> : <p className="muted">Bir karaktere tıkla.</p>)}
        {tab === 'activity' && <ActivityTab room={room} />}
        {tab === 'sessions' && <SessionsTab room={room} />}
        {tab === 'info' && <InfoTab room={room} />}
      </div>
    </aside>
  );
}
