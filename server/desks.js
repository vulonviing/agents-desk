// The office is one open room of desks. Each desk is a project folder with one permanent, named coordinator.
export const VARIANTS = ['adam0', 'adam1', 'adam2', 'adam3', 'alex0', 'alex1', 'alex2', 'alex3', 'amelia0', 'amelia1', 'amelia2', 'amelia3', 'bob0', 'bob1', 'bob2', 'bob3'];

// the shared (all-desks) dialogue scope keeps the id of the former Giriş floor so its saved pool carries over
export const FLOOR_ID = 'growth';
export const coordinatorId = (deskId) => `${deskId}#project`;

const hash = (s) => [...String(s)].reduce((n, c) => (Math.imul(n, 31) + c.charCodeAt(0)) | 0, 7) >>> 0;

/** The coordinators the office shows, with the live state of their chats. */
export function buildCoordinators(desks, chatState = () => null) {
  return desks.map((d) => {
    const id = coordinatorId(d.id);
    const chat = chatState(id);
    return {
      id, deskId: d.id, kind: d.kind ?? 'project', name: d.coordinator ?? `${d.name} Koordinatörü`, nameEn: d.coordinatorEn ?? `${d.name} Coordinator`, deskName: d.label ?? d.name, deskNameEn: d.labelEn ?? d.label ?? d.name, role: d.description ?? '',
      variant: VARIANTS[hash(d.id) % VARIANTS.length],
      status: chat?.busy ? 'working' : 'idle',
      sessionProvider: chat?.provider ?? null, hasSession: !!chat?.sessionId,
      lastActivity: chat?.at ?? null,
    };
  });
}
