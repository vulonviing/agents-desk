import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Avatar } from '../AgentPanel/Avatar';

export type StatusTone = 'working' | 'thinking' | 'idle';

interface Props {
  ariaLabel: string;
  avatar: string;
  title: string;
  subtitle: string;
  status: { tone: StatusTone; label: string };
  /** buttons next to the close button ("Sime git", "Resume komutunu kopyala", …) */
  actions?: ReactNode;
  onClose: () => void;
  notice?: ReactNode;
  /** the scrolling conversation */
  children: ReactNode;
  /** changes whenever the log grows (keeps it scrolled to the end) */
  scrollKey: unknown;
  placeholder: string;
  maxLength?: number;
  sendDisabled?: boolean;
  /** true while a reply is being prepared: the composer waits */
  busy: boolean;
  onSend: (text: string) => void | Promise<void>;
  resetLabel: string;
  resetDisabled?: boolean;
  onReset: () => void;
  note?: ReactNode;
  /** extra buttons in the composer row */
  composerExtra?: ReactNode;
  /** shown instead of the log when set (e.g. the Master's CLI output) */
  alternate?: ReactNode;
  focusKey?: string;
}

// One conversation layout for everybody (coordinators, skill agents and the Master): header, log, composer. Behaviour stays
// in the callers; this component only arranges the structure so every chat looks and feels the same.
export function ChatShell(p: Props) {
  const [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [p.scrollKey]);
  useEffect(() => { input.current?.focus(); }, [p.focusKey]);
  const submit = () => {
    const t = text.trim();
    if (!t || p.busy || p.sendDisabled) return;
    setText('');
    void p.onSend(t);
  };
  return (
    <aside className="chat-panel" aria-label={p.ariaLabel}>
      <header className="chat-head">
        <Avatar variant={p.avatar} scale={1.5} />
        <div className="chat-title">
          <strong>{p.title}</strong>
          <span className="muted">{p.subtitle}</span>
          <span className={`pill ${p.status.tone}`}>{p.status.label}</span>
        </div>
        <button type="button" className="close" aria-label="Sohbeti kapat" onClick={p.onClose}>✕</button>
        {p.actions && <div className="chat-head-actions">{p.actions}</div>}
      </header>
      {p.notice}
      {p.alternate ?? <div className="chat-log" role="log" aria-live="polite">{p.children}<div ref={end} /></div>}
      <div className="chat-input">
        <textarea
          ref={input}
          value={text}
          rows={3}
          maxLength={p.maxLength ?? 2000}
          placeholder={p.placeholder}
          aria-label="Mesaj"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
          }}
        />
        <div className="chat-actions">
          <button type="button" className="primary" disabled={p.busy || p.sendDisabled || !text.trim()} onClick={submit}>Gönder</button>
          <button type="button" disabled={p.resetDisabled} onClick={p.onReset}>{p.resetLabel}</button>
          {p.composerExtra}
        </div>
        {p.note && <p className="muted">{p.note}</p>}
      </div>
    </aside>
  );
}
