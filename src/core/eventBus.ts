type Handler<T> = (payload: T) => void;

export class EventBus<Events extends Record<string, any>> {
  private handlers = new Map<keyof Events, Set<Handler<any>>>();

  on<K extends keyof Events>(event: K, handler: Handler<Events[K]>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler);
    return () => set!.delete(handler);
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const h of set) h(payload);
  }
}

export type GameEvents = {
  'gold:changed': { gold: number; delta: number };
  'shards:changed': { shards: number; delta: number };
  'item:looted': { itemId: string };
  'item:equipped': { slot: string; itemId: string | null };
  'monster:slain': { gold: number; xp: number };
  'upgrade:purchased': { id: string };
  'raid:started': { tier: number };
  'raid:ended': { won: boolean; goldGained: number; shardsGained: number };
  'state:saved': void;
  'toast': { text: string; color?: string };
};

export const bus = new EventBus<GameEvents>();
