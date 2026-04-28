import { Module } from "@nestjs/common";
import { PlatformServicesModule } from "../platform/platform-services.module.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { PasswordService } from "./password.service.js";
import { TokenService } from "./token.service.js";
import { TotpService } from "./totp.service.js";
import { RolesGuard } from "./guards/roles.guard.js";
import { ScopesGuard } from "./guards/scopes.guard.js";

@Module({
  imports: [PlatformServicesModule],
  controllers: [AuthController],
  providers: [AuthService, PasswordService, TokenService, TotpService, RolesGuard, ScopesGuard],
  exports: [AuthService, PasswordService, TokenService, TotpService, RolesGuard, ScopesGuard]
})
export class AuthModule {}
