import { BadRequestException, Injectable } from "@nestjs/common";
import { createInstitutionApplicationSchema } from "@acadid/shared";
import { PrismaService } from "../platform/services/prisma.service.js";

@Injectable()
export class PortalService {
  constructor(private readonly prisma: PrismaService) {}

  async createInstitutionApplication(input: unknown) {
    const parsed = createInstitutionApplicationSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const existingPendingApplication = await this.prisma.institutionApplication.findFirst({
      where: {
        contactEmail: parsed.data.contactEmail.trim().toLowerCase(),
        status: "PENDING"
      },
      select: { uuid: true }
    });
    if (existingPendingApplication) {
      throw new BadRequestException("An institution application is already pending for this contact email.");
    }

    const application = await this.prisma.institutionApplication.create({
      data: {
        officialName: parsed.data.officialName.trim(),
        type: parsed.data.type,
        state: parsed.data.state.trim(),
        address: parsed.data.address.trim(),
        contactPersonName: parsed.data.contactPersonName.trim(),
        contactEmail: parsed.data.contactEmail.trim().toLowerCase(),
        studentVolume: parsed.data.studentVolume,
        documentUploads: parsed.data.documentUploads,
        mouAcceptedAt: new Date()
      },
      select: {
        uuid: true,
        officialName: true,
        type: true,
        status: true,
        createdAt: true
      }
    });

    return {
      accepted: true,
      applicationId: application.uuid,
      status: application.status,
      institutionName: application.officialName,
      institutionType: application.type,
      submittedAt: application.createdAt
    };
  }
}
