// Küçük, güvenli markdown görüntüleyici (raporlar ve sohbet için).
// Önce HTML kaçışlanır, sonra sınırlı sözdizimi uygulanır.
(function () {
  'use strict';
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function inline(s) {
    return s
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  }

  function render(md, { imageBase } = {}) {
    const lines = esc(String(md || '')).split(/\r?\n/);
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (/^```/.test(line)) {
        const buf = [];
        i++;
        while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
        i++;
        out.push(`<pre><code>${buf.join('\n')}</code></pre>`);
        continue;
      }
      const h = /^(#{1,4})\s+(.*)$/.exec(line);
      if (h) { out.push(`<h${h[1].length + 1}>${inline(h[2])}</h${h[1].length + 1}>`); i++; continue; }
      if (/^\s*\|/.test(line)) {
        const rows = [];
        while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(lines[i++]);
        const cells = (r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => inline(c.trim()));
        const body = rows.filter((r) => !/^\s*\|?\s*:?-{2,}/.test(r));
        out.push('<table>' + body.map((r, ri) => '<tr>' + cells(r).map((c) => (ri === 0 ? `<th>${c}</th>` : `<td>${c}</td>`)).join('') + '</tr>').join('') + '</table>');
        continue;
      }
      if (/^\s*[-*]\s+/.test(line)) {
        const items = [];
        while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
          let it = lines[i++].replace(/^\s*[-*]\s+/, '');
          it = it.replace(/^\[x\]/i, '✅').replace(/^\[ \]/, '⬜').replace(/^\[!\]/, '⛔').replace(/^\[~\]/, '🔄');
          items.push(`<li>${inline(it)}</li>`);
        }
        out.push(`<ul>${items.join('')}</ul>`);
        continue;
      }
      if (/^\s*\d+\.\s+/.test(line)) {
        const items = [];
        while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) items.push(`<li>${inline(lines[i++].replace(/^\s*\d+\.\s+/, ''))}</li>`);
        out.push(`<ol>${items.join('')}</ol>`);
        continue;
      }
      const img = /^!\[([^\]]*)\]\(([^)\s]+)\)/.exec(line);
      if (img && imageBase && /^(screenshots\/)?[\w.-]+\.(png|jpe?g|webp)$/i.test(img[2])) {
        const file = img[2].replace(/^screenshots\//, '');
        out.push(`<p><img alt="${img[1]}" src="${imageBase}${encodeURIComponent(file)}"></p>`);
        i++;
        continue;
      }
      if (!line.trim()) { i++; continue; }
      const para = [];
      while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|\s*[-*]\s|\s*\d+\.\s|\s*\|)/.test(lines[i])) para.push(lines[i++]);
      out.push(`<p>${inline(para.join('<br>'))}</p>`);
    }
    return out.join('\n');
  }

  window.renderMarkdown = render;
})();
