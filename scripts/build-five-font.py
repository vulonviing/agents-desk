"""Build the single, original pixel glyph used to disambiguate digit five.

Optional development dependencies: fonttools and brotli. No runtime dependency.
Metrics match Pixelify Sans at the same CSS size; all other characters fall back.
"""
from pathlib import Path
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

font = FontBuilder(1000, isTTF=True)
font.setupGlyphOrder(['.notdef', 'five'])
font.setupCharacterMap({0x35: 'five'})
empty = TTGlyphPen(None).glyph()
pen = TTGlyphPen(None)
# Square top-left corner and a full top bar distinguish 5 from S and 8.
for row, pixels in enumerate(['11111', '10000', '10000', '11110', '00001', '00001', '11110']):
    for col, value in enumerate(pixels):
        if value == '0':
            continue
        x, y = 59 + col * 96, 635 - (row + 1) * 92
        pen.moveTo((x, y))
        pen.lineTo((x, y + 92))
        pen.lineTo((x + 96, y + 92))
        pen.lineTo((x + 96, y))
        pen.closePath()
font.setupGlyf({'.notdef': empty, 'five': pen.glyph()})
font.setupHorizontalMetrics({'.notdef': (597, 0), 'five': (597, 59)})
font.setupHorizontalHeader(ascent=900, descent=-250)
font.setupNameTable({'familyName': 'Desk Five', 'styleName': 'Regular', 'uniqueFontIdentifier': 'AgentsDesk-OriginalFive-v1', 'fullName': 'Desk Five', 'psName': 'DeskFive-Regular', 'copyright': 'Original pixel glyph drawn for Agents Desk.'})
font.setupOS2(sTypoAscender=900, sTypoDescender=-250, usWinAscent=900, usWinDescent=250, sxHeight=500, sCapHeight=635)
font.setupPost()
font.font.flavor = 'woff2'
font.save(Path(__file__).resolve().parents[1] / 'office/public/fonts/desk-five.woff2')
