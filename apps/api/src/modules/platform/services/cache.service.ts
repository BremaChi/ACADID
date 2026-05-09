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

type CacheRemoteRecord<T> = {
  value: T;
  expiresAt: number;
  tags: string[];
};

type CacheRemoteAdapter = {
  readonly name: string;
  get<T>(key: string): Promise<CacheRemoteRecord<T> | null>;
  set<T>(key: string, record: CacheRemoteRecord<T>, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
  invalidateTag(tag: string): Promise<void>;
  invalidatePrefix(prefix: string): Promise<void>;
  clear(): Promise<void>;
  stats(): Promise<Record<string, unknown>>;
};

@Injectable()
export class CacheService {
  private readonly entries = new Map<string, CacheEntry<unknown>>();
  private readonly tagIndex = new Map<string, Set<string>>();
  private readonly remote = this.createRemoteAdapter();

  async getOrSet<T>(key: string, loader: () => Promise<T>, options: CacheSetOptions): Promise<T> {
    const cached = this.get<T>(key);
    if (cached.hit) {
      return cached.value;
    }

    const remote = await this.getRemote<T>(key);
    if (remote.hit) {
      this.setLocal(key, remote.value, {
        ttlSeconds: Math.max(1, Math.ceil((remote.expiresAt - Date.now()) / 1000)),
        tags: remote.tags
      });
      return remote.value;
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

    const expiresAt = Date.now() + options.ttlSeconds * 1000;
    const tags = this.setLocal(key, value, { ttlSeconds: options.ttlSeconds, tags: options.tags, expiresAt });

    void this.remote?.set(key, {
      value,
      expiresAt,
      tags: [...tags]
    }, options.ttlSeconds).catch(() => undefined);
  }

  delete(key: string) {
    if (!this.deleteLocal(key)) {
      return;
    }
    void this.remote?.delete(key).catch(() => undefined);
  }

  invalidateTag(tag: string) {
    const keys = [...(this.tagIndex.get(tag) ?? [])];
    for (const key of keys) {
      this.deleteLocal(key);
    }
    void this.remote?.invalidateTag(tag).catch(() => undefined);
  }

  invalidatePrefix(prefix: string) {
    const keys = [...this.entries.keys()].filter((key) => key.startsWith(prefix));
    for (const key of keys) {
      this.deleteLocal(key);
    }
    void this.remote?.invalidatePrefix(prefix).catch(() => undefined);
  }

  clear() {
    this.entries.clear();
    this.tagIndex.clear();
    void this.remote?.clear().catch(() => undefined);
  }

  stats() {
    return {
      entries: this.entries.size,
      tags: this.tagIndex.size,
      adapter: this.remote?.name ?? "memory",
      distributedConfigured: Boolean(this.remote)
    };
  }

  async distributedStats() {
    return {
      ...this.stats(),
      remote: this.remote ? await this.remote.stats() : null
    };
  }

  private async getRemote<T>(key: string): Promise<{ hit: true; value: T; expiresAt: number; tags: string[] } | { hit: false }> {
    if (!this.remote) {
      return { hit: false };
    }

    try {
      const record = await this.remote.get<T>(key);
      if (!record || record.expiresAt <= Date.now()) {
        if (record) {
          void this.remote.delete(key).catch(() => undefined);
        }
        return { hit: false };
      }
      return { hit: true, value: record.value, expiresAt: record.expiresAt, tags: record.tags };
    } catch {
      return { hit: false };
    }
  }

  private setLocal<T>(key: string, value: T, options: CacheSetOptions & { expiresAt?: number }) {
    this.deleteLocal(key);
    const tags = new Set(options.tags ?? []);
    this.entries.set(key, {
      value,
      expiresAt: options.expiresAt ?? Date.now() + options.ttlSeconds * 1000,
      tags
    });

    for (const tag of tags) {
      const keys = this.tagIndex.get(tag) ?? new Set<string>();
      keys.add(key);
      this.tagIndex.set(tag, keys);
    }

    return tags;
  }

  private deleteLocal(key: string) {
    const entry = this.entries.get(key);
    if (!entry) {
      return false;
    }
    this.entries.delete(key);
    for (const tag of entry.tags) {
      const keys = this.tagIndex.get(tag);
      keys?.delete(key);
      if (keys?.size === 0) {
        this.tagIndex.delete(tag);
      }
    }
    return true;
  }

  private createRemoteAdapter(): CacheRemoteAdapter | null {
    const adapter = process.env.ACADID_CACHE_ADAPTER?.trim().toLowerCase();
    if (adapter && adapter !== "memory" && adapter !== "upstash") {
      return null;
    }

    const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
    const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
    if ((adapter === "upstash" || url || token) && url && token) {
      return new UpstashRedisCacheAdapter(url, token, process.env.ACADID_CACHE_KEY_PREFIX ?? "acadid:cache");
    }

    return null;
  }
}

class UpstashRedisCacheAdapter implements CacheRemoteAdapter {
  readonly name = "upstash-redis";

  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly prefix: string
  ) {}

  async get<T>(key: string): Promise<CacheRemoteRecord<T> | null> {
    const result = await this.command(["GET", this.cacheKey(key)]);
    if (!result) {
      return null;
    }

    const parsed = typeof result === "string" ? JSON.parse(result) : result;
    if (!this.isRecord(parsed)) {
      return null;
    }
    return parsed as CacheRemoteRecord<T>;
  }

  async set<T>(key: string, record: CacheRemoteRecord<T>, ttlSeconds: number) {
    await this.command(["SET", this.cacheKey(key), JSON.stringify(record), "EX", String(ttlSeconds)]);
    for (const tag of record.tags) {
      await this.command(["SADD", this.tagKey(tag), key]);
      await this.command(["EXPIRE", this.tagKey(tag), String(ttlSeconds)]);
    }
  }

  async delete(key: string) {
    await this.command(["DEL", this.cacheKey(key)]);
  }

  async invalidateTag(tag: string) {
    const result = await this.command(["SMEMBERS", this.tagKey(tag)]);
    const keys = Array.isArray(result) ? result.filter((key): key is string => typeof key === "string") : [];
    for (const key of keys) {
      await this.delete(key);
    }
    await this.command(["DEL", this.tagKey(tag)]);
  }

  async invalidatePrefix(prefix: string) {
    let cursor = "0";
    do {
      const result = await this.command(["SCAN", cursor, "MATCH", this.cacheKey(`${prefix}*`), "COUNT", "100"]);
      if (!Array.isArray(result) || result.length < 2) {
        return;
      }
      cursor = String(result[0]);
      const keys = Array.isArray(result[1]) ? result[1].filter((key): key is string => typeof key === "string") : [];
      for (const key of keys) {
        await this.command(["DEL", key]);
      }
    } while (cursor !== "0");
  }

  async clear() {
    await this.invalidatePrefix("");
  }

  async stats() {
    return {
      adapter: this.name,
      keyPrefix: this.prefix,
      configured: true
    };
  }

  private async command(command: string[]) {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/pipeline`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify([command]),
      signal: AbortSignal.timeout(this.timeoutMs())
    });
    if (!response.ok) {
      throw new Error(`Cache adapter failed with HTTP ${response.status}.`);
    }
    const [first] = (await response.json()) as Array<{ result?: unknown; error?: string }>;
    if (first?.error) {
      throw new Error(first.error);
    }
    return first?.result;
  }

  private cacheKey(key: string) {
    return `${this.prefix}:entry:${key}`;
  }

  private tagKey(tag: string) {
    return `${this.prefix}:tag:${tag}`;
  }

  private timeoutMs() {
    const configured = Number(process.env.ACADID_CACHE_TIMEOUT_MS ?? "1000");
    return Number.isFinite(configured) ? Math.min(5000, Math.max(250, configured)) : 1000;
  }

  private isRecord(value: unknown): value is CacheRemoteRecord<unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }
    return "value" in value && "expiresAt" in value && "tags" in value;
  }
}
