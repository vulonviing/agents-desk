import { useEffect, useState } from 'react';
import { gameApi } from '../../game/gameApi';
import { EMPTY_THREAD, threadKey, useManagers } from '../../stores/managersStore';
import { useOffice } from '../../stores/officeStore';
import { ChatShell } from '../Chat/ChatShell';
import { FormattedMessage } from '../Chat/FormattedMessage';

// The Master's conversation uses the same chat layout as every coordinator (ChatShell). What is specific to the Master is
// kept here: routing choices, the "go to the office" card and an optional view of the CLI output instead of the log.
export function MasterChatPanel({ managerId }: { managerId: string }) {
  const manager = useOffice((s) => s.office?.managers?.find((m) => m.id === managerId));
  const close = useOffice((s) => s.selectManager);
  const { provider, busy, busyManagerId, threads, terminal, dispatch, clear, loadTerminal } = useManagers();
  const thread = threads[threadKey(provider, managerId)] ?? EMPTY_THREAD;
  const [explainMode, setExplainMode] = useState(false);
  const [showCli, setShowCli] = useState(false);
  const [terminalError, setTerminalError] = useState('');
  const entries = terminal.filter((e) => e.provider === provider && e.managerId === managerId);
  const thinking = busy && busyManagerId === managerId;
  useEffect(() => { setExplainMode(false); setShowCli(false); }, [managerId, provider]);
  useEffect(() => {
    if (!showCli) return;
    setTerminalError('');
    void loadTerminal(managerId).catch(() => setTerminalError('CLI çıktısına ulaşılamadı.'));
  }, [showCli, managerId, provider, loadTerminal]);
  if (!manager) return null;
  const last = thread.last;
  const cliName = provider === 'codex' ? 'Codex' : 'Claude Code';
  return (
    <ChatShell
      ariaLabel={`${manager.name} sohbeti`}
      avatar={manager.variant}
      title={manager.name}
      subtitle={`Yönetim ofisi · ${cliName}`}
      status={{ tone: thinking ? 'thinking' : 'idle', label: thinking ? 'Düşünüyor' : 'Sohbete hazır' }}
      actions={<><button type="button" onClick={() => gameApi.host?.focusAgent(managerId)}>Sime git</button><button type="button" aria-pressed={showCli} onClick={() => setShowCli((v) => !v)}>{showCli ? 'Sohbet' : 'CLI çıktısı'}</button></>}
      onClose={() => close(null)}
      scrollKey={`${thread.messages.length}-${thinking}-${last?.clarification?.id ?? ''}-${explainMode}`}
      placeholder={explainMode ? 'Ne kastettiğini açıkla…' : 'Aklındakini anlat… (Enter gönderir, Shift+Enter yeni satır)'}
      maxLength={4000}
      busy={busy}
      onSend={async (t) => { if (t.length < 2) return; await dispatch(t, managerId, { reconsider: explainMode }); setExplainMode(false); }}
      resetLabel="Yeni konuşma"
      resetDisabled={busy || !thread.messages.length}
      onReset={() => clear(managerId)}
      note="Master yalnızca yönlendirir; iş yapmaz. Konuşma sen sıfırlamadıkça aynı bağlamda sürer."
      focusKey={managerId}
      alternate={showCli ? (
        <div className="chat-log terminal-lines" role="log" aria-label="Canlı CLI çıktısı" aria-live="polite">
          {entries.length === 0 && <p className="muted">Henüz CLI çağrısı yok. Sohbetten mesaj gönderdiğinde Master’ın çıktısı burada görünür.</p>}
          {entries.map((e) => <div key={e.id} className={`terminal-entry ${e.kind}`}><small>{e.at.slice(11, 19)} · {e.label}</small><pre>{e.text}</pre></div>)}
          {terminalError && <p className="error">{terminalError}</p>}
        </div>
      ) : undefined}
    >
      <div className="msg assistant">Merhaba! Ne üzerinde çalışmak istiyorsun? Aklındakini anlat, doğru ofisi birlikte bulalım.</div>
      {thread.messages.map((m, i) => <div className={`msg ${m.role}`} key={`${m.at}-${i}`}><FormattedMessage text={m.text} /></div>)}
      {thinking && <div className="activity-card live" role="status"><span aria-hidden="true">●</span><div><strong>Düşünüyorum…</strong></div></div>}
      {!thinking && !thread.error && last?.clarification?.options.map((o) => <button className="manager-option" key={o.id} type="button" disabled={busy} onClick={() => { setExplainMode(false); void dispatch(o.name, managerId, { targetId: o.id }); }}>{o.name} →</button>)}
      {!thinking && !thread.error && !!last?.clarification?.options.length && <button type="button" className={`manager-option alternate ${explainMode ? 'chosen' : ''}`} disabled={busy} onClick={() => setExplainMode(true)}>Başka bir şey kastettim… <span>3</span></button>}
      {explainMode && <p className="manager-explain-hint">Ne kastettiğini yaz; yönlendirmeyi yeniden düşüneyim.</p>}
      {!thinking && !thread.error && last?.go && <div className="activity-card live">
        <span aria-hidden="true">→</span>
        <div><strong>{last.route.map((r) => r.target).join(' → ')}</strong><small><button type="button" className="primary" onClick={() => useOffice.getState().enterRoom(last.go!.roomId)}>Ofise git</button></small></div>
      </div>}
    </ChatShell>
  );
}
