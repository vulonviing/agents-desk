import { useEffect, useMemo, useState } from 'react';
import { gameApi } from '../../game/gameApi';
import { timeAgo } from '../../lib/format';
import { useChat } from '../../stores/chatStore';
import { useManagers } from '../../stores/managersStore';
import { useOffice } from '../../stores/officeStore';
import { ChatShell } from './ChatShell';
import { ResumeButton } from './ResumeButton';
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

  useEffect(() => { void load(agentId); }, [agentId, provider, load]);

  // Live CLI output of this coordinator's own turns (same bounded log the Master uses)
  const terminal = useManagers((s) => s.terminal);
  const loadTerminal = useManagers((s) => s.loadTerminal);
  const [showCli, setShowCli] = useState(false);
  const [terminalError, setTerminalError] = useState('');
  const entries = terminal.filter((e) => e.provider === provider && e.managerId === agentId);
  useEffect(() => { setShowCli(false); }, [agentId, provider]);
  useEffect(() => {
    if (!showCli) return;
    setTerminalError('');
    void loadTerminal(agentId).catch(() => setTerminalError('CLI çıktısına ulaşılamadı.'));
  }, [showCli, agentId, provider, loadTerminal]);

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

  return (
    <ChatShell
      ariaLabel={`${dto.name} sohbeti`}
      avatar={dto.variant}
      title={dto.name}
      subtitle={`${room?.name} · ${cliName}`}
      status={{ tone: working ? 'working' : busy ? 'thinking' : 'idle', label: working ? '● CLI çalışıyor' : busy ? 'Yanıtlıyor' : bound ? 'Oturum bağlı' : 'Sohbete hazır' }}
      actions={<><button type="button" onClick={() => gameApi.host?.focusAgent(dto.id)}>Sime git</button>{dto.sessionId && <ResumeButton agentId={dto.id} />}<button type="button" aria-pressed={showCli} onClick={() => setShowCli((v) => !v)}>{showCli ? 'Sohbet' : 'CLI çıktısı'}</button></>}
      onClose={() => openChat(null)}
      notice={wrongCli ? <p className="warn">Bu oturum {CLI[bound]} kullanıyor. Üst bardan aynı CLI’ı seç.</p> : undefined}
      scrollKey={`${messages.length}-${busy}-${dto.cliActive}`}
      placeholder="Mesaj yaz… (Enter gönderir, Shift+Enter yeni satır)"
      busy={busy}
      sendDisabled={working || wrongCli}
      onSend={(t) => send(agentId, t)}
      resetLabel="Yeni konuşma"
      resetDisabled={busy || messages.length === 0}
      onReset={() => void reset(agentId)}
      note="Tek oturum: sen sıfırlamadıkça konuşma aynı CLI oturumunda sürer. Sohbet salt-okunurdur; işler kartlarda ve simlerde görünür."
      focusKey={agentId}
      alternate={showCli ? (
        <div className="chat-log terminal-lines" role="log" aria-label="Canlı CLI çıktısı" aria-live="polite">
          {entries.length === 0 && <p className="muted">Henüz CLI çağrısı yok. Sohbetten mesaj gönderdiğinde CLI’ın çıktısı burada görünür.</p>}
          {entries.map((e) => <div key={e.id} className={`terminal-entry ${e.kind}`}><small>{e.at.slice(11, 19)} · {e.label}</small><pre>{e.text}</pre></div>)}
          {terminalError && <p className="error">{terminalError}</p>}
        </div>
      ) : undefined}
    >
      {messages.length === 0 && !busy && <p className="muted">Henüz mesaj yok. Bu ofiste ne istediğini yaz; CLI’ın yaptığı işler aşağıda kartlar olarak görünür.</p>}
      {timeline.map(item => {
        if (item.type === 'message') return <div key={item.key} className={`msg ${item.message.role}`}><FormattedMessage text={item.message.text} /></div>;
        const e = item.event;
        return <div key={item.key} className="activity-card">
          <span aria-hidden="true">{e.kind === 'error' ? '⛔' : e.kind === 'handoff' ? '⇄' : '⚙'}</span>
          <div>
            <strong>{e.kind === 'error' ? 'Tur kesildi' : e.kind === 'handoff' ? `${stationName(e.from)} → ${stationName(e.to)}` : `${stationName(e.to)}`}</strong>
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
    </ChatShell>
  );
}
