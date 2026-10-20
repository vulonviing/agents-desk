import { Avatar } from '../AgentPanel/Avatar';
import { gameApi } from '../../game/gameApi';
import { stationStatus } from '../../game/systems/stationStatus';
import { useOffice } from '../../stores/officeStore';
import type { Room, Station } from '../../types';

const RISK = { readonly: 'salt-okunur', effect: 'yan etkili', unknown: 'risk belirsiz' } as const;
const BARS = '▁▂▃▄▅▆▇█';

export function spark(byDay: number[] | null): string {
  if (!byDay) return '';
  const days = [...byDay].reverse();
  const max = Math.max(1, ...days);
  return days.map((n) => (n ? BARS[Math.min(BARS.length - 1, Math.ceil((n / max) * (BARS.length - 1)))] : '·')).join('');
}

export function ActivityTab({ room }: { room: Room }) {
  const agents = useOffice(s => s.office?.agents);
  const selected = useOffice(s => s.selectedStationId);
  const selectAgent = useOffice(s => s.selectAgent);
  const activity = useOffice(s => s.office?.activity.rooms[room.id]);
  const live = useOffice(s => s.office?.live[room.id]);
  const residents = [...(agents ?? [])].filter(a => a.roomId === room.id).sort((a,b) => Number(!!b.coordinator) - Number(!!a.coordinator) || Number(!!b.cliActive) - Number(!!a.cliActive) || a.name.localeCompare(b.name, 'tr'));
  const station = room.stations.find(s => s.id === selected);
  return <div>
    <h3>Ajanlar · {residents.length}</h3>
    <p className="muted">Koordinatörler en üstte. Bir ajana tıklayarak simine git ve profilini aç.</p>
    <div className="stations agent-roster">
      {residents.map(agent => <button key={agent.id} type="button" className={`station agent-row ${agent.cliActive ? 'live' : ''}`} onClick={() => { selectAgent(agent.id); gameApi.host?.focusAgent(agent.id); }}>
        <Avatar variant={agent.variant} />
        <span><strong>{agent.coordinator ? '◆ ' : ''}{agent.name}</strong><span className="sub">{agent.coordinator ? agent.sessionProvider ? `${agent.sessionProvider === 'codex' ? 'Codex' : 'Claude Code'} · ${agent.cliActive ? 'çalışıyor' : 'oturum bağlı'}` : 'Koordinatör · sohbete hazır' : agent.cliActive ? 'İstasyon etkin' : agent.stationWorker ? 'İş istasyonu · hazır' : 'Skill · görev bekliyor'}</span></span>
        <span className={`dot ${agent.cliActive ? 'active' : 'idle'}`} />
      </button>)}
    </div>
    {station && <details className="station-contract"><summary>Seçili istasyon · {station.name}</summary><StationDetail station={station} status={stationStatus(station.id, activity, live?.stationId ?? null, Date.now())} /></details>}
  </div>;
}

function StationDetail({ station, status }: { station: Station; status: ReturnType<typeof stationStatus> }) {
  return (
    <div className="detail">
      <h3>{station.name}</h3>
      <div className="chips">
        <span className="chip">{station.kind === 'skill' ? 'skill' : 'görev'}</span>
        <span className={`chip ${station.risk === 'effect' ? 'warn' : station.risk === 'readonly' ? 'ok' : ''}`}>{RISK[station.risk]}</span>
        {station.runsOn !== 'local' && <span className="chip">çalıştığı yer: {station.runsOn}</span>}
      </div>
      {station.description && <p>{station.description}</p>}
      <p className={status.live ? 'ok' : ''}>{status.live ? 'Şu an bu masada çalışılıyor.' : status.days === null ? 'Son 14 günde kullanılmadı.' : `Son kullanım: ${status.label}${status.lastTool ? ` (${status.lastTool})` : ''}`}</p>
      {status.byDay && <p className="spark">14 gün  {spark(status.byDay)}  bugün</p>}
      {station.scripts.length > 0 && (
        <>
          <h4>Script'ler</h4>
          <ul className="list">{station.scripts.map((s) => <li key={s}><code>{s}</code></li>)}</ul>
        </>
      )}
      {station.paths.length > 0 && (
        <>
          <h4>Yollar</h4>
          <ul className="list">{station.paths.map((s) => <li key={s}><code>{s}</code></li>)}</ul>
        </>
      )}
    </div>
  );
}
