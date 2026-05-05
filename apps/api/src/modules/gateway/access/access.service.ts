import { BadRequestException, Injectable } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { createAccessGrantSchema, createRecordRequestSchema, revokeAccessGrantSchema } from "@acadid/shared";
import type { AuthTokenPayload } from "../../auth/types.js";
import { AuditService } from "../../platform/services/audit.service.js";
import { PrismaService } from "../../platform/services/prisma.service.js";

@Injectable()
export class AccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  async passport(auth: AuthTokenPayload) {
    const learnerId = this.requireLearner(auth);
    const learner = await this.prisma.learner.findUnique({
      where: { uuid: learnerId },
      select: {
        ain: true,
        fullName: true,
        dateOfBirth: true,
        identityStatus: true,
        enrolments: {
          select: {
            studentNumber: true,
            level: true,
            programme: true,
            status: true,
            institution: {
              select: {
                institutionId: true,
                officialName: true
              }
            }
          }
        }
      }
    });

    if (!learner) {
      throw new BadRequestException("Learner passport not found.");
    }

    return learner;
  }

  async credentials(auth: AuthTokenPayload) {
    const learnerId = this.requireLearner(auth);
    return this.prisma.credential.findMany({
      where: { learnerId },
      orderBy: { issuedAt: "desc" },
      select: {
        credentialRef: true,
        type: true,
        status: true,
        issuedAt: true,
        revokedAt: true,
        revocationReason: true,
        institution: {
          select: {
            institutionId: true,
            officialName: true
          }
        }
      }
    });
  }

  async createShareLink(auth: AuthTokenPayload, body: unknown) {
    const learnerId = this.requireLearner(auth);
    const parsed = createAccessGrantSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const credential = await this.prisma.credential.findFirst({
      where: {
        credentialRef: parsed.data.credentialRef,
        learnerId
      }
    });

    if (!credential) {
      throw new BadRequestException("Credential not found for learner.");
    }

    if (credential.status !== "ACTIVE") {
      throw new BadRequestException("Only active credentials can be shared.");
    }

    const token = randomBytes(32).toString("base64url");
    const grant = await this.prisma.accessGrant.create({
      data: {
        learnerId,
        credentialId: credential.uuid,
        tokenHash: this.hashToken(token),
        scope: parsed.data.scope,
        recipientLabel: parsed.data.recipientLabel,
        expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : undefined,
        maxViews: parsed.data.maxViews
      },
      select: {
        uuid: true,
        scope: true,
        recipientLabel: true,
        expiresAt: true,
        maxViews: true
      }
    });

    await this.audit.write({
      actorId: auth.sub,
      actorRole: auth.role,
      action: "access_grant.create",
      targetType: "AccessGrant",
      targetId: grant.uuid,
      outcome: "SUCCESS",
      metadata: {
        credentialRef: parsed.data.credentialRef,
        scope: grant.scope,
        recipientLabel: grant.recipientLabel
      }
    });

    return {
      accepted: true,
      accessGrantId: grant.uuid,
      token,
      verifyUrl: `/verify/${token}`,
      scope: grant.scope,
      recipientLabel: grant.recipientLabel,
      expiresAt: grant.expiresAt,
      maxViews: grant.maxViews
    };
  }

  async revokeGrant(auth: AuthTokenPayload, body: unknown) {
    const learnerId = this.requireLearner(auth);
    const parsed = revokeAccessGrantSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const grant = await this.prisma.accessGrant.update({
      where: { uuid: parsed.data.accessGrantId },
      data: { revokedAt: new Date() },
      select: {
        uuid: true,
        learnerId: true,
        revokedAt: true
      }
    });

    if (grant.learnerId !== learnerId) {
      throw new BadRequestException("Access Grant does not belong to learner.");
    }

    await this.audit.write({
      actorId: auth.sub,
      actorRole: auth.role,
      action: "access_grant.revoke",
      targetType: "AccessGrant",
      targetId: grant.uuid,
      outcome: "SUCCESS"
    });

    return { accepted: true, accessGrantId: grant.uuid, revokedAt: grant.revokedAt };
  }

  async verificationLog(auth: AuthTokenPayload) {
    const learnerId = this.requireLearner(auth);
    return this.prisma.verificationEvent.findMany({
      where: {
        credential: {
          learnerId
        }
      },
      orderBy: { verifiedAt: "desc" },
      take: 100,
      select: {
        uuid: true,
        verifierType: true,
        verifierName: true,
        outcome: true,
        verifiedAt: true,
        scopeViewed: true,
        credential: {
          select: {
            credentialRef: true,
            type: true,
            institution: {
              select: {
                institutionId: true,
                officialName: true
              }
            }
          }
        }
      }
    });
  }

  async createRecordRequest(auth: AuthTokenPayload, body: unknown) {
    const learnerId = this.requireLearner(auth);
    const parsed = createRecordRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    if (parsed.data.learnerId && parsed.data.learnerId !== learnerId) {
      throw new BadRequestException("Record request learnerId must match the authenticated learner.");
    }

    const request = await this.prisma.recordRequest.create({
      data: {
        requestId: await this.nextRecordRequestId(),
        learnerId,
        institutionId: parsed.data.institutionId,
        institutionNameSubmitted: parsed.data.institutionNameSubmitted,
        educationLevel: parsed.data.educationLevel,
        yearsAttendedFrom: parsed.data.yearsAttendedFrom,
        yearsAttendedTo: parsed.data.yearsAttendedTo,
        studentNumber: parsed.data.studentNumber,
        departmentOrClass: parsed.data.departmentOrClass,
        recordTypesRequested: parsed.data.recordTypesRequested,
        proofDocumentUrls: parsed.data.proofDocumentUrls,
        requesterName: parsed.data.requesterName ?? auth.fullName,
        requesterEmail: parsed.data.requesterEmail ?? auth.email,
        status: "SUBMITTED",
        paymentStatus: "PENDING",
        notes: []
      },
      include: this.recordRequestInclude()
    });

    await this.audit.write({
      actorId: auth.sub,
      actorRole: auth.role,
      action: "record_request.create",
      targetType: "RecordRequest",
      targetId: request.uuid,
      institutionId: request.institutionId ?? undefined,
      outcome: "SUCCESS",
      metadata: {
        requestId: request.requestId,
        recordTypesRequested: request.recordTypesRequested
      }
    });

    return { accepted: true, request };
  }

  async listRecordRequests(auth: AuthTokenPayload) {
    const learnerId = this.requireLearner(auth);
    return this.prisma.recordRequest.findMany({
      where: { learnerId },
      include: this.recordRequestInclude(),
      orderBy: { createdAt: "desc" },
      take: 100
    });
  }

  private requireLearner(auth: AuthTokenPayload): string {
    if (!auth.learnerId) {
      throw new BadRequestException("Authenticated account is not linked to a learner passport.");
    }

    return auth.learnerId;
  }

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private async nextRecordRequestId() {
    const year = new Date().getUTCFullYear();
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const suffix = randomBytes(4).toString("hex").toUpperCase();
      const requestId = `REQ-${year}-${suffix}`;
      const existing = await this.prisma.recordRequest.findUnique({ where: { requestId }, select: { uuid: true } });
      if (!existing) {
        return requestId;
      }
    }

    throw new BadRequestException("Could not allocate a record request ID.");
  }

  private recordRequestInclude() {
    return {
      institution: {
        select: {
          uuid: true,
          institutionId: true,
          officialName: true,
          state: true,
          status: true
        }
      }
    };
  }
}
