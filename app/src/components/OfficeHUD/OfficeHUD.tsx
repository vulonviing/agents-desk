import { useMemo, useState, useEffect } from 'react';
import { getJson, postJson } from '../../services/api';
import { resetDialogues } from '../../services/dialogues';
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
  const [location, setLocation] = useState<'unset' | 'loading' | 'ready' | 'error'>('unset');
  useEffect(() => { void getJson<{configured:boolean}>('/api/dialogues/location').then(r=>setLocation(r.configured ? 'ready' : 'unset')).catch(()=>{}); }, []);
  const useLocation = () => {
    if (!navigator.geolocation) { setLocation('error'); return; }
    setLocation('loading');
    navigator.geolocation.getCurrentPosition(position => {
      void postJson('/api/dialogues/location', { latitude: position.coords.latitude, longitude: position.coords.longitude }).then(()=>{resetDialogues();setLocation('ready');}).catch(()=>setLocation('error'));
    }, () => setLocation('error'), { enableHighAccuracy: false, timeout: 15000, maximumAge: 3600000 });
  };
  const clearLocation = () => { void postJson('/api/dialogues/location', {clear:true}).then(()=>{resetDialogues();setLocation('unset');}).catch(()=>setLocation('error')); };
  const { inMaster, floorsOpen, goMaster, toggleFloors, effectsEnabled, toggleEffects } = useOffice();
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
        <details className="life-controls"><summary>Ofis yaşamı</summary><div className="life-options">
        <button type="button" className="ghost" aria-pressed={effectsEnabled} onClick={toggleEffects} title="Işık ve ofis efektlerini aç veya kapat">Atmosfer {effectsEnabled ? 'açık' : 'kapalı'}</button>
        <button type="button" className="ghost" onClick={useLocation} disabled={location === 'loading'} title="Hava sohbetleri için yaklaşık konumunu kullan; yalnız hava servisiyle paylaşılır">{location === 'loading' ? 'Konum alınıyor…' : location === 'ready' ? 'Hava · konum açık' : location === 'error' ? 'Konum alınamadı · tekrar dene' : 'Konumumu kullan'}</button>
        {location === 'ready' && <button type="button" className="ghost" onClick={clearLocation} aria-label="Hava konumunu sil">× Konum</button>}
        </div></details>
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
