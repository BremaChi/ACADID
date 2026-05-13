import { BadRequestException, Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";

export type StorageObject = {
  content: Buffer;
  bucket: string;
  key: string;
  source: "supabase" | "download_base";
};

export type StorageDownloadHealth = {
  status: "OPERATIONAL" | "DEGRADED" | "PENDING_CONFIGURATION";
  responseTimeMs: number;
  message: string;
  metadata: {
    provider: "supabase" | "download_base" | "unconfigured";
    configured: boolean;
    bucket: string | null;
    downloadBaseConfigured: boolean;
    supabaseUrlConfigured: boolean;
    serviceRoleConfigured: boolean;
    probeConfigured: boolean;
    probeSucceeded: boolean | null;
    probeSource: "supabase" | "download_base" | null;
    probeBytes: number | null;
    probeKeyHash: string | null;
    maxDownloadBytes: number;
  };
};

const maxDownloadBytes = 25 * 1024 * 1024;

@Injectable()
export class ObjectStorageService {
  async checkDownloadHealth(): Promise<StorageDownloadHealth> {
    const startedAt = Date.now();
    const config = this.readConfiguration();
    const probeUrl = process.env.ACADID_OBJECT_STORAGE_HEALTHCHECK_URL ?? process.env.ACADID_STORAGE_HEALTHCHECK_URL;

    const baseMetadata = {
      provider: config.provider,
      configured: config.configured,
      bucket: config.bucket,
      downloadBaseConfigured: config.downloadBaseConfigured,
      supabaseUrlConfigured: config.supabaseUrlConfigured,
      serviceRoleConfigured: config.serviceRoleConfigured,
      probeConfigured: Boolean(probeUrl),
      probeSucceeded: null,
      probeSource: null,
      probeBytes: null,
      probeKeyHash: null,
      maxDownloadBytes
    } satisfies StorageDownloadHealth["metadata"];

    if (!config.configured) {
      return {
        status: "PENDING_CONFIGURATION",
        responseTimeMs: Date.now() - startedAt,
        message: "Object storage download is not configured for worker imports.",
        metadata: baseMetadata
      };
    }

    if (!probeUrl) {
      return {
        status: "OPERATIONAL",
        responseTimeMs: Date.now() - startedAt,
        message: "Object storage download configuration is present; no health probe object is configured.",
        metadata: baseMetadata
      };
    }

    try {
      const object = await this.readObject(probeUrl);
      return {
        status: "OPERATIONAL",
        responseTimeMs: Date.now() - startedAt,
        message: `Storage download probe succeeded through ${object.source}.`,
        metadata: {
          ...baseMetadata,
          probeSucceeded: true,
          probeSource: object.source,
          probeBytes: object.content.byteLength,
          probeKeyHash: this.hashKey(object.key)
        }
      };
    } catch (error) {
      return {
        status: "DEGRADED",
        responseTimeMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : "Storage download probe failed.",
        metadata: {
          ...baseMetadata,
          probeSucceeded: false
        }
      };
    }
  }

  async readObject(storageUrl: string): Promise<StorageObject> {
    const parsed = this.parseStorageUrl(storageUrl);
    if (!parsed) {
      throw new BadRequestException("Unsupported storage URL.");
    }

    const directBaseUrl = process.env.ACADID_OBJECT_STORAGE_DOWNLOAD_BASE_URL;
    if (directBaseUrl) {
      return {
        ...(await this.download(
          `${directBaseUrl.replace(/\/$/, "")}/${encodeURIComponent(parsed.bucket)}/${this.encodeKey(parsed.key)}`,
          process.env.ACADID_OBJECT_STORAGE_BEARER_TOKEN
        )),
        bucket: parsed.bucket,
        key: parsed.key,
        source: "download_base"
      };
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new BadRequestException("Object storage download is not configured for worker imports.");
    }

    return {
      ...(await this.download(
        `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/${encodeURIComponent(parsed.bucket)}/${this.encodeKey(parsed.key)}`,
        supabaseServiceKey,
        supabaseServiceKey
      )),
      bucket: parsed.bucket,
      key: parsed.key,
      source: "supabase"
    };
  }

  parseStorageUrl(storageUrl: string) {
    if (!storageUrl.startsWith("storage://")) {
      return null;
    }

    const withoutScheme = storageUrl.slice("storage://".length);
    const separator = withoutScheme.indexOf("/");
    if (separator <= 0 || separator === withoutScheme.length - 1) {
      throw new BadRequestException("Storage URL must include bucket and object key.");
    }

    return {
      bucket: withoutScheme.slice(0, separator),
      key: withoutScheme.slice(separator + 1)
    };
  }

  private readConfiguration() {
    const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? process.env.OBJECT_STORAGE_BUCKET ?? process.env.STORAGE_BUCKET ?? null;
    const downloadBaseConfigured = Boolean(process.env.ACADID_OBJECT_STORAGE_DOWNLOAD_BASE_URL);
    const supabaseUrlConfigured = Boolean(process.env.SUPABASE_URL);
    const serviceRoleConfigured = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY);
    const supabaseConfigured = Boolean(bucket && supabaseUrlConfigured && serviceRoleConfigured);
    const provider = downloadBaseConfigured ? "download_base" : supabaseConfigured ? "supabase" : "unconfigured";

    return {
      bucket,
      configured: downloadBaseConfigured || supabaseConfigured,
      downloadBaseConfigured,
      provider,
      serviceRoleConfigured,
      supabaseUrlConfigured
    } as const;
  }

  private async download(url: string, bearerToken?: string, apiKey?: string) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.downloadTimeoutMs());
    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          ...(bearerToken ? { authorization: `Bearer ${bearerToken}` } : {}),
          ...(apiKey ? { apikey: apiKey } : {})
        },
        signal: controller.signal
      });
    } catch (error) {
      throw new BadRequestException(error instanceof Error && error.name === "AbortError" ? "Storage download timed out." : "Could not reach storage download service.");
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new BadRequestException(`Could not download storage object: ${response.status}`);
    }

    const contentLength = response.headers.get("content-length");
    if (contentLength && Number(contentLength) > maxDownloadBytes) {
      throw new BadRequestException("Storage object is larger than the worker import limit.");
    }

    const content = Buffer.from(await response.arrayBuffer());
    if (content.byteLength > maxDownloadBytes) {
      throw new BadRequestException("Storage object is larger than the worker import limit.");
    }

    return { content };
  }

  private encodeKey(key: string) {
    return key
      .split("/")
      .map((part) => encodeURIComponent(part))
      .join("/");
  }

  private downloadTimeoutMs() {
    const value = Number(process.env.ACADID_OBJECT_STORAGE_TIMEOUT_MS ?? 10_000);
    if (!Number.isFinite(value)) {
      return 10_000;
    }
    return Math.min(60_000, Math.max(1_000, Math.floor(value)));
  }

  private hashKey(key: string) {
    return createHash("sha256").update(key).digest("hex").slice(0, 16);
  }
}
