import { Body, Controller, Get, Post } from "@nestjs/common";
import { AccessService } from "./access.service.js";

@Controller("access")
export class AccessController {
  constructor(private readonly accessService: AccessService) {}

  @Get("passport")
  passport() {
    return this.accessService.passport();
  }

  @Get("credentials")
  credentials() {
    return this.accessService.credentials();
  }

  @Post("share-link")
  createShareLink(@Body() body: unknown) {
    return this.accessService.createShareLink(body);
  }

  @Post("revoke-grant")
  revokeGrant(@Body() body: unknown) {
    return this.accessService.revokeGrant(body);
  }

  @Get("verification-log")
  verificationLog() {
    return this.accessService.verificationLog();
  }
}
