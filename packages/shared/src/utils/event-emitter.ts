type EventMap = Record<string, unknown>;

export class TypedEmitter<T extends EventMap> {
  private listeners = new Map<
    keyof T,
    Array<(payload: T[keyof T]) => void>
  >();

  on<K extends keyof T>(event: K, listener: (payload: T[K]) => void): void {
    const existing = this.listeners.get(event);
    if (existing === undefined) {
      this.listeners.set(event, [listener]);
      return;
    }

    existing.push(listener);
  }

  off<K extends keyof T>(event: K, listener: (payload: T[K]) => void): void {
    const existing = this.listeners.get(event);
    if (existing === undefined) {
      return;
    }

    const index = existing.indexOf(listener);
    if (index === -1) {
      return;
    }

    existing.splice(index, 1);
  }

  once<K extends keyof T>(event: K, listener: (payload: T[K]) => void): void {
    const wrappedListener = (payload: T[K]): void => {
      this.off(event, wrappedListener);
      listener(payload);
    };

    this.on(event, wrappedListener);
  }

  emit<K extends keyof T>(event: K, payload: T[K]): void {
    const existing = this.listeners.get(event);
    if (existing === undefined) {
      return;
    }

    existing.forEach((listener) => {
      listener(payload);
    });
  }

  listenerCount<K extends keyof T>(event: K): number {
    const existing = this.listeners.get(event);
    if (existing === undefined) {
      return 0;
    }

    return existing.length;
  }

  removeAllListeners<K extends keyof T>(event?: K): void {
    if (event === undefined) {
      this.listeners.clear();
      return;
    }

    this.listeners.delete(event);
  }
}
