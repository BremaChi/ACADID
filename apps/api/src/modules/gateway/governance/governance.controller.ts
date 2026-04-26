import { Body, Controller, Post } from "@nestjs/common";
import { GovernanceService } from "./governance.service.js";

@Controller("govern")
export class GovernanceController {
  constructor(private readonly governanceService: GovernanceService) {}

  @Post("submit-batch")
  submitBatch(@Body() body: { batchId: string }) {
    return this.governanceService.transitionBatch(body.batchId, "SUBMITTED");
  }

  @Post("review-batch")
  reviewBatch(@Body() body: { batchId: string }) {
    return this.governanceService.transitionBatch(body.batchId, "REVIEWED");
  }

  @Post("approve-batch")
  approveBatch(@Body() body: { batchId: string }) {
    return this.governanceService.transitionBatch(body.batchId, "APPROVED");
  }

  @Post("publish")
  publish(@Body() body: { batchId: string }) {
    return this.governanceService.publishBatch(body.batchId);
  }

  @Post("reject-batch")
  rejectBatch(@Body() body: { batchId: string; reason: string }) {
    return this.governanceService.rejectBatch(body.batchId, body.reason);
  }

  @Post("amend")
  amend(@Body() body: unknown) {
    return this.governanceService.amend(body);
  }

  @Post("revoke")
  revoke(@Body() body: unknown) {
    return this.governanceService.revoke(body);
  }
}
