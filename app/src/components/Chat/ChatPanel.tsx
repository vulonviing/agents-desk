import { useEffect, useMemo, useRef, useState } from 'react';
import { gameApi } from '../../game/gameApi';
import { timeAgo } from '../../lib/format';
import { useChat } from '../../stores/chatStore';
import { useManagers } from '../../stores/managersStore';
import { useOffice } from '../../stores/officeStore';
import { Avatar } from '../AgentPanel/Avatar';
import { FormattedMessage } from './FormattedMessage';
import { chatTimeline } from './timeline';

const EMPTY: never[] = [];
const CLI = { claude: 'Claude Code', codex: 'Codex' } as const;

// The conversation with a coordinator or agent, on the left of the canvas. Activity cards come from what the
// observer really saw (never invented); "Sime git" focuses the sim.
export function ChatPanel({ agentId }: { agentId: string }) {
  const dto = useOffice((s) => s.office?.agents.find((a) => a.id === agentId));
  const room = useOffice((s) => s.projects?.floors.flatMap((f) => f.rooms).find((r) => r.id === dto?.roomId));
  const observations = useOffice((s) => s.office?.observations);
  const openChat = useOffice((s) => s.openChat);
  const provider = useManagers((s) => s.provider);
  const key = `${provider}:${agentId}`;
  const messages = useChat((s) => s.byAgent[key]) ?? EMPTY;
  const busy = useChat((s) => !!s.busy[key]);
  const { load, send, reset } = useChat.getState();
  const [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { void load(agentId); }, [agentId, provider, load]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [messages.length, busy, dto?.cliActive]);
  useEffect(() => { input.current?.focus(); }, [agentId]);

  const stationName = (id: string | null) => room?.stations.find((s) => s.id === id)?.name ?? id ?? '';
  // observed events of this agent (oldest first), shown as cards under the messages
  const cards = useMemo(() => (observations ?? [])
    .filter((e) => e.roomId === dto?.roomId && e.provider === (dto?.sessionProvider ?? provider) && (dto?.coordinator ? e.sessionId === dto.sessionId || e.coordinatorId === dto.id : e.to === dto?.deskId || e.from === dto?.deskId))
    .slice(-6), [observations, dto, provider]);
  const timeline = useMemo(() => chatTimeline(messages, cards), [messages, cards]);
  if (!dto) return null;
  const bound = dto.sessionProvider ?? null;
  const wrongCli = !!bound && bound !== provider;
  const cliName = CLI[bound ?? provider];
  const working = !!dto.cliActive;

  const submit = () => {
    const t = text.trim();
    if (!t || busy || working || wrongCli) return;
    setText('');
    void send(agentId, t);
  };

  return (
    <aside className="chat-panel" aria-label={`${dto.name} sohbeti`}>
      <header className="chat-head">
        <Avatar variant={dto.variant} scale={1.5} />
        <div className="chat-title">
          <strong>{dto.name}</strong>
          <span className="muted">{room?.name} · {cliName}</span>
          <span className={`pill ${working ? 'working' : busy ? 'thinking' : 'idle'}`}>{working ? '● CLI çalışıyor' : busy ? 'Yanıtlıyor' : bound ? 'Oturum bağlı' : 'Sohbete hazır'}</span>
        </div>
        <button type="button" onClick={() => gameApi.host?.focusAgent(dto.id)}>Sime git</button>
        <button type="button" className="close" aria-label="Sohbeti kapat" onClick={() => openChat(null)}>✕</button>
      </header>
      {wrongCli && <p className="warn">Bu oturum {CLI[bound]} kullanıyor. Üst bardan aynı CLI’ı seç.</p>}
      <div className="chat-log" aria-live="polite">
        {messages.length === 0 && !busy && <p className="muted">Henüz mesaj yok. Bu ofiste ne istediğini yaz; CLI’ın yaptığı işler aşağıda kartlar olarak görünür.</p>}
        {timeline.map(item => {
          if (item.type === 'message') return <div key={item.key} className={`msg ${item.message.role}`}><FormattedMessage text={item.message.text} /></div>;
          const e = item.event;
          return <div key={item.key} className="activity-card">
            <span aria-hidden="true">{e.kind === 'completed' ? '✔' : e.kind === 'error' ? '⛔' : e.kind === 'handoff' ? '⇄' : '⚙'}</span>
            <div>
              <strong>{e.kind === 'completed' ? 'Tur tamamlandı' : e.kind === 'error' ? 'Tur kesildi' : e.kind === 'handoff' ? `${stationName(e.from)} → ${stationName(e.to)}` : `${stationName(e.to)}`}</strong>
              <small>{e.kind === 'handoff' ? `${e.file ?? 'dosya'} aktarıldı` : e.kind === 'activation' ? `${e.tool} · ${timeAgo(e.at)}` : timeAgo(e.at)}</small>
            </div>
          </div>;
        })}
        {(busy || working) && <div className="activity-card live" role="status">
          <span aria-hidden="true">●</span>
          <div><strong>{busy ? 'Yanıt hazırlanıyor…' : 'CLI çalışıyor'}</strong>
            {working && dto.observation?.tool && <small>{dto.observation.tool}{dto.observation.file ? ` · ${dto.observation.file}` : ''}</small>}
          </div>
        </div>}
        <div ref={end} />
      </div>
      <div className="chat-input">
        <textarea
          ref={input}
          value={text}
          rows={3}
          maxLength={2000}
          placeholder="Mesaj yaz… (Enter gönderir, Shift+Enter yeni satır)"
          aria-label="Mesaj"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <div className="chat-actions">
          <button type="button" className="primary" disabled={busy || working || !text.trim() || wrongCli} onClick={submit}>Gönder</button>
          <button type="button" disabled={busy || messages.length === 0} onClick={() => void reset(agentId)}>{dto.sessionId ? 'Görünümü temizle' : 'Yeni konuşma'}</button>
        </div>
        <p className="muted">Sohbet salt-okunurdur; gerçek CLI’ın işleri yukarıdaki kartlarda ve simlerde görünür.</p>
      </div>
    </aside>
  );
}
