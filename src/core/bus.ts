// Tiny typed event bus shared by gameplay systems.

export type GameEvent =
  | { type: 'toast'; text: string; kind?: 'good' | 'bad' | 'info' }
  | { type: 'collect'; item: string; qty: number }
  | { type: 'talk'; npc: string }
  | { type: 'repair'; id: string }
  | { type: 'trade'; vendor: string; item: string; qty: number; buy: boolean }
  | { type: 'eat' }
  | { type: 'drink' }
  | { type: 'enter'; zone: string }
  | { type: 'candy'; phase: string }
  | { type: 'choice'; id: string; option: string }
  | { type: 'quest'; id: string; stage: number }
  | { type: 'sfx'; name: string; x?: number; y?: number; z?: number; vol?: number };

type Handler = (e: GameEvent) => void;

export class Bus {
  private handlers: Handler[] = [];
  on(h: Handler): void {
    this.handlers.push(h);
  }
  emit(e: GameEvent): void {
    for (const h of this.handlers) h(e);
  }
}
