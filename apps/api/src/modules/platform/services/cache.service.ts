import { Injectable } from "@nestjs/common";

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
  tags: Set<string>;
};

type CacheSetOptions = {
  ttlSeconds: number;
  tags?: string[];
};

@Injectable()
export class CacheService {
  private readonly entries = new Map<string, CacheEntry<unknown>>();
  private readonly tagIndex = new Map<string, Set<string>>();

  async getOrSet<T>(key: string, loader: () => Promise<T>, options: CacheSetOptions): Promise<T> {
    const cached = this.get<T>(key);
    if (cached.hit) {
      return cached.value;
    }

    const value = await loader();
    this.set(key, value, options);
    return value;
  }

  get<T>(key: string): { hit: true; value: T } | { hit: false } {
    const entry = this.entries.get(key);
    if (!entry) {
      return { hit: false };
    }
    if (entry.expiresAt <= Date.now()) {
      this.delete(key);
      return { hit: false };
    }
    return { hit: true, value: entry.value as T };
  }

  set<T>(key: string, value: T, options: CacheSetOptions) {
    if (options.ttlSeconds <= 0) {
      return;
    }

    this.delete(key);
    const tags = new Set(options.tags ?? []);
    this.entries.set(key, {
      value,
      expiresAt: Date.now() + options.ttlSeconds * 1000,
      tags
    });

    for (const tag of tags) {
      const keys = this.tagIndex.get(tag) ?? new Set<string>();
      keys.add(key);
      this.tagIndex.set(tag, keys);
    }
  }

  delete(key: string) {
    const entry = this.entries.get(key);
    if (!entry) {
      return;
    }
    this.entries.delete(key);
    for (const tag of entry.tags) {
      const keys = this.tagIndex.get(tag);
      keys?.delete(key);
      if (keys?.size === 0) {
        this.tagIndex.delete(tag);
      }
    }
  }

  invalidateTag(tag: string) {
    const keys = [...(this.tagIndex.get(tag) ?? [])];
    for (const key of keys) {
      this.delete(key);
    }
  }

  invalidatePrefix(prefix: string) {
    const keys = [...this.entries.keys()].filter((key) => key.startsWith(prefix));
    for (const key of keys) {
      this.delete(key);
    }
  }

  clear() {
    this.entries.clear();
    this.tagIndex.clear();
  }

  stats() {
    return {
      entries: this.entries.size,
      tags: this.tagIndex.size
    };
  }
}
