// Pure camera math: the camera is a world-space center plus a zoom factor.

export const MIN_ZOOM = 0.4;
export const MAX_ZOOM = 6;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function fitCamera(worldW, worldH, viewW, viewH, pad = 24) {
  const z = clamp(Math.min((viewW - 2 * pad) / worldW, (viewH - 2 * pad) / worldH), MIN_ZOOM, MAX_ZOOM);
  return { x: worldW / 2, y: worldH / 2, z };
}

export const worldToScreen = (cam, wx, wy, viewW, viewH) => ({
  x: (wx - cam.x) * cam.z + viewW / 2,
  y: (wy - cam.y) * cam.z + viewH / 2,
});

export const screenToWorld = (cam, sx, sy, viewW, viewH) => ({
  x: (sx - viewW / 2) / cam.z + cam.x,
  y: (sy - viewH / 2) / cam.z + cam.y,
});

// Zooms by `factor` keeping the world point under screen (sx, sy) fixed.
export function zoomAt(cam, factor, sx, sy, viewW, viewH) {
  const z = clamp(cam.z * factor, MIN_ZOOM, MAX_ZOOM);
  const before = screenToWorld(cam, sx, sy, viewW, viewH);
  const next = { ...cam, z };
  const after = screenToWorld(next, sx, sy, viewW, viewH);
  return { x: cam.x + before.x - after.x, y: cam.y + before.y - after.y, z };
}

// Keeps at least part of the world on screen: the center may not leave the world rectangle.
export function clampCamera(cam, worldW, worldH) {
  return { ...cam, x: clamp(cam.x, 0, worldW), y: clamp(cam.y, 0, worldH) };
}

// Camera that frames a world rectangle with some breathing room.
export function frameRect(rect, viewW, viewH, pad = 60, maxZoom = 3.2) {
  const z = clamp(Math.min((viewW - 2 * pad) / rect.w, (viewH - 2 * pad) / rect.h), MIN_ZOOM, maxZoom);
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2, z };
}
