import { createLiveAdapter } from './liveAdapter';
import { createMockAdapter } from './mockAdapter';
import type { AgentAdapter } from './types';

export type { AdapterHandlers, AgentAdapter, TaskEvent } from './types';

// ?demo=1 switches to the labelled demo provider; otherwise the real desk server is used.
export function createAdapter(search = typeof location === 'undefined' ? '' : location.search): AgentAdapter {
  return new URLSearchParams(search).get('demo') === '1' ? createMockAdapter() : createLiveAdapter();
}
