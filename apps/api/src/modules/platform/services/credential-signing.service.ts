import { Injectable } from "@nestjs/common";
import { PlaceholderCredentialSigner } from "@acadid/crypto";

@Injectable()
export class CredentialSigningService extends PlaceholderCredentialSigner {}
