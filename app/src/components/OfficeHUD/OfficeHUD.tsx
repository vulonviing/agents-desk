import { useMemo } from 'react';
import { getAdapter } from '../../services/bootstrap';
import { EMPTY_SUMMARY, useOffice } from '../../stores/officeStore';
import { useManagers } from '../../stores/managersStore';
import { useTasks } from '../../stores/tasksStore';

const CONNECTION: Record<string, { text: string; cls: string }> = {
  live: { text: 'Canlı', cls: 'ok' },
  connecting: { text: 'Bağlanıyor…', cls: 'warn' },
  reconnecting: { text: 'Yeniden bağlanıyor…', cls: 'warn' },
  offline: { text: 'Bağlantı yok', cls: 'bad' },
};

export function OfficeHUD() {
  const { inMaster, floorsOpen, goMaster, toggleFloors } = useOffice();
  const { provider, setProvider, busy } = useManagers();
  const projects = useOffice((s) => s.projects);
  const floorId = useOffice((s) => s.floorId);
  const roomId = useOffice((s) => s.roomId);
  const connection = useOffice((s) => s.connection);
  const demo = useOffice((s) => s.demo);
  const summary = useOffice((s) => s.office?.summary ?? EMPTY_SUMMARY);
  const setFloor = useOffice((s) => s.setFloor);
  const leaveRoom = useOffice((s) => s.leaveRoom);
  const runs = useTasks((s) => s.runs);
  const doneRuns = useMemo(() => Object.values(runs).filter((r) => r.state === 'done').length, [runs]);
  const failedRuns = useMemo(() => Object.values(runs).filter((r) => r.state === 'failed').length, [runs]);
  const conn = CONNECTION[connection]!;
  const active = summary.working + summary.thinking;

  return (
    <header className="hud">
      <div className="hud-left">
        <h1>Agents Desk</h1>
        {demo && <span className="badge demo" title="Gösterilen her şey uydurmadır">DEMO</span>}
        <button type="button" aria-pressed={inMaster} className={`master-nav ${inMaster ? 'on' : ''}`} data-view="master" onClick={goMaster}>★ Master</button>
        <div className="floor-group" aria-label="Kat geçişleri">
        <button type="button" className="floor-group-label" aria-expanded={floorsOpen} aria-controls="floor-navigation" onClick={toggleFloors}>Katlar {floorsOpen ? '▴' : '▾'}</button>
        {floorsOpen && <nav id="floor-navigation" className="floors" aria-label="Katlar">
          {projects?.floors.map((f) => (
            <button key={f.id} type="button" aria-pressed={!inMaster && f.id === floorId} className={!inMaster && f.id === floorId ? 'on' : ''} onClick={() => setFloor(f.id)}>
              <span className="floor-icon" aria-hidden="true">▥</span>{f.name}
              <small>{f.rooms.length}</small>
            </button>
          ))}
        </nav>}
        </div>
        {roomId && (
          <button type="button" className="back" onClick={leaveRoom}>
            ← Kata dön
          </button>
        )}
      </div>
      <div className="hud-stats" role="status" aria-label="Ofis durumu">
        <label className="cli-select" title="Master ve ofis sohbeti CLI’ı">CLI
          <select aria-label="CLI seç" value={provider} disabled={busy} onChange={(e) => setProvider(e.target.value as 'claude' | 'codex')}>
            <option value="claude">Claude Code</option><option value="codex">Codex</option>
          </select>
        </label>
        <Stat label="Ajan" value={summary.total} />
        <Stat label="Aktif" value={active} tone="ok" />
        <Stat label="Boşta" value={summary.idle} />
        <Stat label="Tamamlanan" value={doneRuns + summary.completed} tone="ok" />
        <Stat label="Hata" value={summary.error + failedRuns} tone={summary.error + failedRuns ? 'bad' : undefined} />
        <span className={`conn ${conn.cls}`}>
          <i />
          {conn.text}
        </span>
        <button type="button" className="ghost" onClick={() => void getAdapter()?.refreshProjects()}>
          Yeniden tara
        </button>
      </div>
    </header>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'ok' | 'bad' }) {
  return (
    <span className={`stat ${tone ?? ''}`}>
      <b>{value}</b>
      <small>{label}</small>
    </span>
  );
}
