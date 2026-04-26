import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class HealthController {
  @Get()
  readHealth() {
    return {
      service: "acadid-api",
      status: "ok"
    };
  }
}
