import { useEffect, useState } from 'react';
import { fetchConversation, fetchSessions } from '../../stores/tasksStore';
import { clock } from '../../lib/format';
import type { Conversation, Room, SessionInfo } from '../../types';

export function SessionsTab({ room }: { room: Room }) {
  const [list, setList] = useState<SessionInfo[] | null>(null);
  const [conv, setConv] = useState<Conversation | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setConv(null);
    setError('');
    fetchSessions(room.id).then((l) => alive && setList(l)).catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [room.id]);

  const open = (id: string) => fetchConversation(room.id, id).then(setConv).catch((e: Error) => setError(e.message));

  return (
    <div className="sessions">
      <p className="muted">Konuşma metinleri yalnızca bu bilgisayarda, sen açınca okunur; hiçbir yere kaydedilmez.</p>
      {error && <p className="error">{error}</p>}
      {conv ? (
        <>
          <button type="button" onClick={() => setConv(null)}>← Oturumlar</button>
          {conv.truncated && <p className="muted">Son {conv.messages.length} mesaj gösteriliyor (toplam {conv.total}).</p>}
          <div className="conv">
            {conv.messages.map((m, i) => (
              <div key={i} className={`msg ${m.role}`}>
                <div className="who">{m.role === 'user' ? 'Sen' : 'Asistan'}{m.ts ? ` · ${clock(m.ts)}` : ''}</div>
                {m.text && <div className="text">{m.text}</div>}
                {m.tools.length > 0 && <div className="tools">{m.tools.map((t) => `🔧 ${t.name}${t.file ? `: ${t.file}` : ''}`).join('  ')}</div>}
              </div>
            ))}
          </div>
        </>
      ) : list === null ? (
        <p className="muted">Yükleniyor…</p>
      ) : list.length === 0 ? (
        <p className="muted">Bu ofis için kayıtlı oturum yok.</p>
      ) : (
        <div className="stations">
          {list.map((s) => (
            <button key={s.id} type="button" className="station" onClick={() => void open(s.id)}>
              <span className="dot" />
              <strong>{new Date(s.lastAt).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' })}</strong>
              <span className="sub">{s.preview || '(metin yok)'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
