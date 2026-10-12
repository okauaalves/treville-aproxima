/** Cache em memória com validade curta e limite de itens (remove os mais antigos). Por instância/isolate. */
export class TtlCache<V> {
  private readonly items = new Map<string, { value: V; expires: number }>();
  private readonly ttlMs: number;
  private readonly maxItems: number;

  constructor(ttlMs: number, maxItems: number) {
    this.ttlMs = ttlMs;
    this.maxItems = maxItems;
  }

  get(key: string, now: number = Date.now()): V | undefined {
    const item = this.items.get(key);
    if (!item) {
      return undefined;
    }
    if (item.expires <= now) {
      this.items.delete(key);
      return undefined;
    }
    return item.value;
  }

  set(key: string, value: V, now: number = Date.now()): void {
    this.items.delete(key);
    this.items.set(key, { value, expires: now + this.ttlMs });
    while (this.items.size > this.maxItems) {
      const oldest = this.items.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      this.items.delete(oldest);
    }
  }

  get size(): number {
    return this.items.size;
  }
}
