import { BadRequestException, Injectable } from "@nestjs/common";

export type StorageObject = {
  content: Buffer;
  bucket: string;
  key: string;
  source: "supabase" | "download_base";
};

const maxDownloadBytes = 25 * 1024 * 1024;

@Injectable()
export class ObjectStorageService {
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

  private async download(url: string, bearerToken?: string, apiKey?: string) {
    const response = await fetch(url, {
      headers: {
        ...(bearerToken ? { authorization: `Bearer ${bearerToken}` } : {}),
        ...(apiKey ? { apikey: apiKey } : {})
      }
    });
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
}
