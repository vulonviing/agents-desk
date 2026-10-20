// The character's front-facing idle frame, cut out of its sprite sheet (pixelated, no extra image files).
export function Avatar({ variant, scale = 3 }: { variant: string; scale?: number }) {
  const col = 18; // idle, facing down
  return (
    <span
      className="avatar"
      aria-hidden="true"
      style={{
        width: 16 * scale,
        height: 32 * scale,
        backgroundImage: `url(assets/generated/characters/${variant}.png)`,
        backgroundSize: `${24 * 16 * scale}px ${4 * 32 * scale}px`,
        backgroundPosition: `${-col * 16 * scale}px ${-32 * scale}px`,
      }}
    />
  );
}
