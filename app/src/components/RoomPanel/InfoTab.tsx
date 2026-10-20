import { fullDate, timeAgo } from '../../lib/format';
import type { Room } from '../../types';

const shellQuote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
const DUST = ['', 'Hafif tozlu', 'Tozlu', 'Çok tozlu, ajan uyuyor'];

export function InfoTab({ room }: { room: Room }) {
  const copy = (text: string) => void navigator.clipboard?.writeText(text);
  return (
    <div>
      <h3>Son güncelleme</h3>
      {room.lastCommit ? (
        <>
          <p>{fullDate(room.lastCommit.date)} · {timeAgo(room.lastCommit.date)}</p>
          <p>{room.lastCommit.subject}</p>
        </>
      ) : (
        <p>Henüz commit yok.</p>
      )}
      {room.dust > 0 && <p className="warnline">{DUST[room.dust]}</p>}
      {room.readmeSummary && (<><h3>Özet</h3><p>{room.readmeSummary}</p></>)}
      {room.notes && (<><h3>Notlar</h3><p>{room.notes}</p></>)}
      {room.triggers.length > 0 && (<><h3>Tetikleyici komutlar</h3><ul className="list">{room.triggers.map((t, i) => <li key={i}>{t}</li>)}</ul></>)}
      {room.embedded.length > 0 && (
        <>
          <h3>Bu ofise bağlı repolar</h3>
          <ul className="list">{room.embedded.map((e) => <li key={e.id}><strong>{e.name}</strong><span className="muted"> — {e.skills.length} skill</span></li>)}</ul>
        </>
      )}
      <h3>Konum</h3>
      <p><code>{room.path}</code></p>
      <div className="chips">
        <button type="button" onClick={() => copy(room.path)}>Yolu kopyala</button>
        <button type="button" onClick={() => copy(`cd ${shellQuote(room.path)} && claude`)}>Terminal komutunu kopyala</button>
      </div>
    </div>
  );
}
