import { Controller, Get, Param, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import type { AuthenticatedRequest } from "../auth/types.js";
import { QueueService } from "../platform/services/queue.service.js";

@UseGuards(AuthGuard)
@Controller("jobs")
export class JobsController {
  constructor(private readonly queue: QueueService) {}

  @Get(":id")
  readJob(@Req() request: AuthenticatedRequest, @Param("id") id: string) {
    return this.queue.readJob(request.auth, id);
  }
}
