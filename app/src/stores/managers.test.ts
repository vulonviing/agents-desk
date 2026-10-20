import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useOffice } from './officeStore';
import { useManagers } from './managersStore';

beforeEach(() => useManagers.setState({ provider: 'codex', busy: false, busyManagerId: null, threads: {}, terminal: [] }));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it('keeps one Master conversation per CLI: switching CLI never resets a thread, the continuation is kept until the user resets', async () => {
  const bodies: Record<string, unknown>[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_path: string, opts: { body: string }) => {
    const body = JSON.parse(opts.body); bodies.push(body);
    return { ok: true, json: async () => ({ provider: body.provider, route: [], plan: null, go: null,
      clarification: { id: 'master-question', by: 'Master', question: 'Hangi ofis?', options: [] } }) };
  }));
  const s = () => useManagers.getState();
  await s().dispatch('paper');
  expect(bodies[0]!.clarificationId).toBeUndefined();
  await s().dispatch('paperhub ofisini aç');
  expect(bodies[1]!.clarificationId).toBe('master-question');
  expect(bodies[1]!.managerId).toBe('manager:master');
  expect(bodies[1]!.provider).toBe('codex');
  s().setProvider('claude');
  expect(Object.keys(s().threads)).toEqual(['codex:manager:master']); // nothing was reset
  s().setProvider('codex');
  expect(s().threads['codex:manager:master']!.last?.clarification?.id).toBe('master-question');
});
it('blocks duplicate sends while a manager is still answering', async () => {
  let resolve!: (v: unknown) => void;
  const fetch = vi.fn(() => new Promise((r) => { resolve = r; }));
  vi.stubGlobal('fetch', fetch);
  const promise = useManagers.getState().dispatch('cv');
  expect(useManagers.getState().busyManagerId).toBe('manager:master');
  expect(await useManagers.getState().dispatch('paper')).toBeNull();
  expect(fetch).toHaveBeenCalledTimes(1);
  resolve({ ok: true, json: async () => ({ route: [], plan: null, go: null }) });
  await promise;
  expect(useManagers.getState().busy).toBe(false);
});

it('an explicit office choice enters it immediately and sends the offered target id', async () => {
  const enter = vi.spyOn(useOffice.getState(), 'enterRoom').mockImplementation(() => {});
  const fetch = vi.fn(async (_url: string, opts: { body: string }) => {
    const body = JSON.parse(opts.body);
    expect(body.targetId).toBe('cv');
    expect(body.clarificationId).toBe('offered');
    return { ok: true, json: async () => ({ route: [], plan: null, go: { floorId: 'g', roomId: 'cv' } }) };
  });
  vi.stubGlobal('fetch', fetch);
  useManagers.setState({ threads: { 'codex:manager:master': { messages: [], error: null, last: { route: [], plan: null, go: null, clarification: { id: 'offered', by: 'Manager', question: 'Which?', options: [{ id: 'cv', name: 'CV' }] } } } } });
  await useManagers.getState().dispatch('CV', 'manager:master', { targetId: 'cv' });
  expect(enter).toHaveBeenCalledWith('cv');
  expect(fetch).toHaveBeenCalledTimes(1);
});
