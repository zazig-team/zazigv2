export class LRUCache<K, V> {
  private readonly capacity: number;

  private readonly map: Map<K, V>;

  constructor(capacity: number) {
    if (capacity < 1) {
      throw new Error("capacity must be at least 1");
    }

    this.capacity = capacity;
    this.map = new Map<K, V>();
  }

  get(key: K): V | undefined {
    if (!this.map.has(key)) {
      return undefined;
    }

    const value = this.map.get(key);

    this.map.delete(key);
    this.map.set(key, value as V);

    return value;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) {
      this.map.delete(key);
      this.map.set(key, value);
      return;
    }

    if (this.map.size >= this.capacity) {
      const firstKey = this.map.keys().next();
      if (!firstKey.done) {
        this.map.delete(firstKey.value);
      }
    }

    this.map.set(key, value);
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  delete(key: K): boolean {
    return this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }

  keys(): K[] {
    return Array.from(this.map.keys());
  }
}
