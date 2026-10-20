import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { FormattedMessage } from './FormattedMessage';
describe('formatted conversation', () => {
  it('renders headings, paragraphs, bold text and separate list entries', () => {
    const html = renderToStaticMarkup(<FormattedMessage text={'## Ürünler\n\n- **Mahur**: müzik\n- **Portfolio**: web\n\nBirini seçebilirsin.'} />);
    expect(html).toContain('<h4>Ürünler</h4>');
    expect(html.match(/<li>/g)).toHaveLength(2);
    expect(html).toContain('<strong>Mahur</strong>');
    expect(html).toContain('<p>Birini seçebilirsin.</p>');
  });
  it('escapes HTML and never creates script or javascript links', () => {
    const html = renderToStaticMarkup(<FormattedMessage text={'<script>alert(1)</script>\n\n[x](javascript:alert)\n\n[Docs](https://example.com)'} />);
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain('href="https://example.com"');
  });
});
