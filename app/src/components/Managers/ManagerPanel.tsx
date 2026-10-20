import { FormattedMessage } from '../Chat/FormattedMessage';
import { useEffect, useRef, useState } from 'react';
import { EMPTY_THREAD, useManagers } from '../../stores/managersStore';
import { useOffice } from '../../stores/officeStore';

export function ManagerPanel({ managerId }: { managerId: string }) {
  const manager = useOffice((s) => s.office?.managers?.find((m) => m.id === managerId));
  const close = useOffice((s) => s.selectManager);
  const { provider, busy, busyManagerId, threads, terminal, dispatch, clear, loadTerminal } = useManagers();
  const thread = threads[managerId] ?? EMPTY_THREAD;
  const [tab, setTab] = useState<'chat' | 'terminal'>('chat');
  const [text, setText] = useState('');
  const [explainMode, setExplainMode] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const [terminalError, setTerminalError] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const terminalEnd = useRef<HTMLDivElement>(null);
  const entries = terminal.filter((e) => e.provider === provider && e.managerId === managerId);
  const thinking = busy && busyManagerId === managerId;
  useEffect(() => { setTab('chat'); setText(''); setExplainMode(false); }, [managerId, provider]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [thread.messages.length, thinking, tab]);
  useEffect(() => { terminalEnd.current?.scrollIntoView({ block: 'nearest' }); }, [entries.length, tab]);
  useEffect(() => {
    if (tab !== 'terminal') return;
    setTerminalError('');
    void loadTerminal(managerId).catch(() => setTerminalError('CLI çıktısına ulaşılamadı.'));
  }, [tab, managerId, provider, loadTerminal]);
  if (!manager) return <p>Yönetici bulunamadı.</p>;
  const submit = async () => {
    const message = text.trim();
    if (busy || message.length < 2) return;
    setText('');
    await dispatch(message, managerId, { reconsider: explainMode });
    setExplainMode(false);
  };
  const go = () => {
    const last = thread.last;
    if (!last?.go) return;
    const s = useOffice.getState();
    s.enterRoom(last.go.roomId);
  };
  return (
    <div className="manager-panel">
      <div className="manager-panel-head">
        <div><h2>{manager.name}</h2><p>{provider === 'codex' ? 'Codex' : 'Claude Code'} <span className="manager-state">{thinking ? '· düşünüyor' : '· sohbet hazır'}</span></p></div>
        <button type="button" aria-label="Sohbet panelini kapat" onClick={() => close(null)}>✕</button>
      </div>
      <div className="tabs" role="tablist" aria-label="Yönetici paneli">
        <button type="button" id="manager-chat-tab" role="tab" aria-controls="manager-chat" aria-selected={tab === 'chat'} className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}>Sohbet</button>
        <button type="button" id="manager-terminal-tab" role="tab" aria-controls="manager-terminal" aria-selected={tab === 'terminal'} className={tab === 'terminal' ? 'active' : ''} onClick={() => setTab('terminal')}>Terminal {thinking && <span className="terminal-live">●</span>}</button>
      </div>
      {tab === 'chat' ? <section id="manager-chat" role="tabpanel" aria-labelledby="manager-chat-tab" className="manager-chat">
        <div className="manager-messages" role="log" aria-label="Yönetici sohbeti" aria-live="polite">
          <div className="manager-msg assistant">Merhaba! Ne üzerinde çalışmak istiyorsun? Aklındakini anlat, doğru ofisi birlikte bulalım.</div>
          {thread.messages.map((m, i) => <div className={`manager-msg ${m.role}`} key={`${m.at}-${i}`}><FormattedMessage text={m.text} /></div>)}
          {thinking && <div className="manager-msg assistant manager-typing">Düşünüyorum<span>…</span></div>}
          {!thinking && !thread.error && thread.last?.clarification?.options.map((o) => <button className="manager-option" key={o.id} type="button" disabled={busy} onClick={() => { setExplainMode(false); void dispatch(o.name, managerId, { targetId: o.id }); }}>{o.name} →</button>)}
          {!thinking && !thread.error && !!thread.last?.clarification?.options.length && <button type="button" className={`manager-option alternate ${explainMode ? 'chosen' : ''}`} disabled={busy} onClick={() => { setExplainMode(true); input.current?.focus(); }}>Başka bir şey kastettim… <span>3</span></button>}
          {explainMode && <p className="manager-explain-hint">Ne kastettiğini yaz; yönlendirmeyi yeniden düşüneyim.</p>}
          {!thinking && !thread.error && thread.last?.go && <div className="manager-destination">
            <small>{thread.last.route.map((r) => r.target).join(' → ')}</small>
            <button type="button" className="primary" onClick={go}>Ofise git</button>
          </div>}
          <div ref={end} />
        </div>
        <form className="manager-composer" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <label className="sr-only" htmlFor="manager-message">Yöneticiye mesaj</label>
          <textarea ref={input} id="manager-message" rows={3} value={text} disabled={busy} maxLength={4000} placeholder={explainMode ? "Ne kastettiğini açıkla…" : "Aklındakini anlat…"}
            onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submit(); } }} />
          <div><button type="button" disabled={busy || !thread.messages.length} onClick={() => clear(managerId)}>Yeni konuşma</button><button className="primary" type="submit" disabled={busy || text.trim().length < 2}>{explainMode ? 'Yeniden düşün ↗' : 'Gönder ↗'}</button></div>
        </form>
      </section> : <section id="manager-terminal" role="tabpanel" aria-labelledby="manager-terminal-tab" className="manager-terminal">
        <div className="terminal-heading"><i />{provider === 'codex' ? 'codex' : 'claude'} <span>canlı çıktı · salt okunur</span></div>
        <div className="terminal-lines" role="log" aria-label="Canlı CLI çıktısı" aria-live="polite">
          {entries.length === 0 && <p className="terminal-empty">Henüz CLI çağrısı yok. Sohbet sekmesinden mesaj gönderdiğinde seçtiğin ajanın çıktısı burada görünür.</p>}
          {entries.map((e) => <div key={e.id} className={`terminal-entry ${e.kind}`}><small>{e.at.slice(11, 19)} · {e.label}</small><pre>{e.text}</pre></div>)}
          {terminalError && <p className="error">{terminalError}</p>}
          <div ref={terminalEnd} />
        </div>
      </section>}
    </div>
  );
}
