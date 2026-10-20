import { gameApi } from '../../game/gameApi';
import { LEVEL_TEXT, timeAgo } from '../../lib/format';
import { agentMission } from '../../lib/agentMission';
import { useOffice } from '../../stores/officeStore';
import { Avatar } from './Avatar';

export function AgentPanel({ agentId }: { agentId: string }) {
  const dto = useOffice(s => s.office?.agents.find(a => a.id === agentId));
  const room = useOffice(s => s.projects?.floors.flatMap(f => f.rooms).find(r => r.id === dto?.roomId));
  const observations = useOffice(s => s.office?.observations);
  const inRoomView = useOffice(s => !!s.roomId);
  const enterRoom = useOffice(s => s.enterRoom);
  const closePanel = useOffice(s => s.closePanel);
  const selectAgent = useOffice(s => s.selectAgent);
  const chatAgentId = useOffice(s => s.chatAgentId);
  const openChat = useOffice(s => s.openChat);
  if (!dto) return <p className="muted">Bu ajan artık yok.</p>;
  const stationName = (id: string | null) => room?.stations.find(s => s.id === id)?.name ?? id ?? '';
  const flow = (observations ?? []).filter(e => e.roomId === dto.roomId && (dto.coordinator ? e.sessionId === dto.sessionId || e.coordinatorId === dto.id : e.to === dto.deskId || e.from === dto.deskId)).slice(-8).reverse();
  return <div className="agent-panel">
    <div className="agent-head">
      <Avatar variant={dto.variant} />
      <div><h2>{dto.name}</h2><p className="muted">{dto.coordinator ? 'Ofis koordinatörü' : dto.stationWorker ? 'İş istasyonu' : 'Skill uzmanı'} · {room?.name}</p><span className={`pill ${dto.cliActive ? 'working' : 'idle'}`}>{dto.cliActive ? '● Çalışıyor' : dto.coordinator ? 'Sohbete hazır' : 'Görev bekliyor'}</span></div>
      <button type="button" className="close" aria-label="Paneli kapat" onClick={() => inRoomView ? selectAgent(null) : closePanel()}>✕</button>
    </div>
    <section className="agent-mission"><h3>Görev tanımı</h3><p>{agentMission(dto, room)}</p></section>
    {dto.observation && <p className="cli-observation"><strong>{dto.cliActive ? 'CLI etkinliği gözleniyor' : 'Oturum bağlı · yanıt bekliyor'}</strong><br />{dto.observation.provider === 'codex' ? 'Codex' : 'Claude Code'}{dto.observation.tool ? ` · ${dto.observation.tool}` : ''}{dto.observation.file ? ` · ${dto.observation.file}` : ''}</p>}
    <div className="actions">
      {!inRoomView && <button type="button" className="primary" onClick={() => enterRoom(dto.roomId)}>Ofise gir</button>}
      <button type="button" onClick={() => gameApi.host?.focusAgent(dto.id)}>Simine git</button>
      {chatAgentId !== dto.id && <button type="button" className="primary" onClick={() => openChat(dto.id)}>Sohbeti aç</button>}
    </div>
    {flow.length > 0 && <section><h3>İş akışı</h3>{flow.map(e => <p key={e.id} className="cli-observation">{e.kind === 'completed' ? '✔ Tur tamamlandı' : e.kind === 'error' ? '⛔ Tur kesildi' : e.kind === 'handoff' ? `${e.file}: ${stationName(e.from)} → ${stationName(e.to)}` : `${stationName(e.to)} · ${e.tool}`}<br /><small>{timeAgo(e.at)}</small></p>)}</section>}
    <details className="agent-technical"><summary>Oturum ve teknik bilgiler</summary><dl className="facts">
      {dto.sessionId && <><dt>Oturum</dt><dd className="mono">{dto.sessionId.slice(-8)}</dd></>}
      {dto.model && <><dt>Model</dt><dd>{dto.model}</dd></>}
      <dt>Sohbet</dt><dd>Salt-okunur</dd><dt>Proje politikası</dt><dd>{LEVEL_TEXT[dto.level] ?? dto.level}</dd>
      <dt>Son etkinlik</dt><dd>{timeAgo(dto.lastActivity)}</dd>
      {dto.deskName && <><dt>Çalışma alanı</dt><dd>{dto.deskName}</dd></>}
    </dl><p className="muted">Mola ve yürüyüşler ofis yaşamıdır. Yeşil işaret, gözlemlenen CLI çalışmasını gösterir.</p></details>
  </div>;
}
