import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { RecordRequestStatus, UserRole } from "@prisma/client";
import { AuthGuard } from "../../auth/guards/auth.guard.js";
import { RolesGuard } from "../../auth/guards/roles.guard.js";
import { ScopesGuard } from "../../auth/guards/scopes.guard.js";
import { Roles } from "../../auth/roles.decorator.js";
import { Scopes } from "../../auth/scopes.decorator.js";
import type { AuthenticatedRequest } from "../../auth/types.js";
import { GovernanceService } from "./governance.service.js";

@UseGuards(AuthGuard, RolesGuard, ScopesGuard)
@Roles(UserRole.ACADID_SUPER_ADMIN, UserRole.REGISTRAR, UserRole.EXAM_OFFICER)
@Scopes("govern:write")
@Controller("govern")
export class GovernanceController {
  constructor(private readonly governanceService: GovernanceService) {}

  @Post("submit-batch")
  submitBatch(@Req() request: AuthenticatedRequest, @Body() body: { batchId: string }) {
    return this.governanceService.transitionBatch(request.auth, body.batchId, "SUBMITTED");
  }

  @Post("review-batch")
  reviewBatch(@Req() request: AuthenticatedRequest, @Body() body: { batchId: string }) {
    return this.governanceService.transitionBatch(request.auth, body.batchId, "REVIEWED");
  }

  @Post("approve-batch")
  approveBatch(@Req() request: AuthenticatedRequest, @Body() body: { batchId: string }) {
    return this.governanceService.transitionBatch(request.auth, body.batchId, "APPROVED");
  }

  @Post("publish")
  publish(@Req() request: AuthenticatedRequest, @Body() body: { batchId: string }) {
    return this.governanceService.publishBatch(request.auth, body.batchId);
  }

  @Post("reject-batch")
  rejectBatch(@Req() request: AuthenticatedRequest, @Body() body: { batchId: string; reason: string }) {
    return this.governanceService.rejectBatch(request.auth, body.batchId, body.reason);
  }

  @Post("rollovers/preview")
  previewRollover(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.governanceService.previewRollover(request.auth, body);
  }

  @Post("rollovers/confirm")
  confirmRollover(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.governanceService.confirmRollover(request.auth, body);
  }

  @Post("amend")
  amend(@Body() body: unknown) {
    return this.governanceService.amend(body);
  }

  @Post("revoke")
  revoke(@Body() body: unknown) {
    return this.governanceService.revoke(body);
  }

  @Get("record-requests")
  listRecordRequests(@Req() request: AuthenticatedRequest, @Query("status") status?: RecordRequestStatus) {
    return this.governanceService.listRecordRequests(request.auth, status);
  }

  @Post("record-requests/:id/review")
  reviewRecordRequest(@Req() request: AuthenticatedRequest, @Param("id") id: string, @Body() body: unknown) {
    return this.governanceService.reviewRecordRequest(request.auth, id, body);
  }
}
