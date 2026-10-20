import { useEffect, useState } from 'react';
import { gameApi } from '../../game/gameApi';
import { useOffice } from '../../stores/officeStore';

export function GameControls() {
  const zoom = useOffice((s) => s.zoom);
  const [full, setFull] = useState(false);
  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.();
  };
  return (
    <div className="controls" role="group" aria-label="Kamera">
      <button type="button" aria-label="Yakınlaştır" onClick={() => gameApi.host?.zoomIn()}>+</button>
      <button type="button" aria-label="Uzaklaştır" onClick={() => gameApi.host?.zoomOut()}>−</button>
      <button type="button" aria-label="Sığdır" title="Tüm haritayı sığdır" onClick={() => gameApi.host?.resetZoom()}>⟲</button>
      <button type="button" aria-label={full ? 'Tam ekrandan çık' : 'Tam ekran'} onClick={toggleFull}>{full ? '⤡' : '⤢'}</button>
      <span className="zoom">{Math.round(zoom * 100)}%</span>
    </div>
  );
}
