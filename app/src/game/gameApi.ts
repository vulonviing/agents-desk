import type { GameHost } from './GameHost';

// React components reach the running game through this holder (set by GameCanvas).
export const gameApi: { host: GameHost | null } = { host: null };
