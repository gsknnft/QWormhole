type Listener<T> = T extends void ? () => void : (payload: T) => void;

export class BrowserEmitter<Events extends object> {
  private readonly listeners = new Map<keyof Events, Set<Function>>();

  on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): this {
    const bucket = this.listeners.get(event) ?? new Set<Function>();
    bucket.add(listener as Function);
    this.listeners.set(event, bucket);
    return this;
  }

  off<K extends keyof Events>(event: K, listener: Listener<Events[K]>): this {
    this.listeners.get(event)?.delete(listener as Function);
    return this;
  }

  emit<K extends keyof Events>(event: K, payload?: Events[K]): boolean {
    const bucket = this.listeners.get(event);
    if (!bucket || bucket.size === 0) return false;
    for (const listener of bucket) {
      (listener as (value?: Events[K]) => void)(payload);
    }
    return true;
  }
}
