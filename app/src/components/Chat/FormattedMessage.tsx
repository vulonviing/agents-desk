import { Fragment, type ReactNode } from 'react';

// Render a small, safe Markdown subset with React text nodes; never accept raw HTML.
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>;
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
    if (link) return <a key={i} href={link[2]} target="_blank" rel="noopener noreferrer">{link[1]}</a>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}
export function FormattedMessage({ text }: { text: string }) {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\s+-\s+(?=\*\*[^*]+\*\*)/g, '\n- ').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) { i++; continue; }
    if (line.startsWith('```')) {
      const code: string[] = []; i++;
      while (i < lines.length && !lines[i]!.startsWith('```')) code.push(lines[i++]!);
      i++; blocks.push(<pre key={blocks.length}><code>{code.join('\n')}</code></pre>); continue;
    }
    const heading = line.match(/^#{1,4}\s+(.+)$/);
    if (heading) { blocks.push(<h4 key={blocks.length}>{inline(heading[1]!)}</h4>); i++; continue; }
    if (/^\s*(?:[-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line), items: ReactNode[] = [];
      while (i < lines.length && (ordered ? /^\s*\d+\.\s+/ : /^\s*[-*]\s+/).test(lines[i]!)) items.push(<li key={items.length}>{inline(lines[i++]!.replace(/^\s*(?:[-*]|\d+\.)\s+/, ''))}</li>);
      blocks.push(ordered ? <ol key={blocks.length}>{items}</ol> : <ul key={blocks.length}>{items}</ul>); continue;
    }
    const paragraph: string[] = [line]; i++;
    while (i < lines.length && lines[i]!.trim() && !/^(?:#{1,4}\s|```|\s*[-*]\s|\s*\d+\.\s)/.test(lines[i]!)) paragraph.push(lines[i++]!);
    blocks.push(<p key={blocks.length}>{paragraph.map((part, n) => <Fragment key={n}>{n > 0 && <br />}{inline(part)}</Fragment>)}</p>);
  }
  return <div className="formatted-message">{blocks}</div>;
}
