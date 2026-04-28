import { SetMetadata } from "@nestjs/common";

export const requiredScopesMetadataKey = "acadid:required_scopes";

export const Scopes = (...scopes: string[]) => SetMetadata(requiredScopesMetadataKey, scopes);
