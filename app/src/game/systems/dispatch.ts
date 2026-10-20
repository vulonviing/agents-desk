export type DeliveryMode = 'visit' | 'message' | 'phone';
// Presentation choices only: a real observed assignment must exist before selecting a delivery style.
export function deliveryMode(seed: string): DeliveryMode {
  const hash = [...seed].reduce((n,c)=>(Math.imul(n,31)+c.charCodeAt(0))>>>0,7);
  return (['visit','message','phone'] as const)[hash%3]!;
}
