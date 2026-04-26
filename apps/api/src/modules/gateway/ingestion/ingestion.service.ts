import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../platform/services/prisma.service.js";

@Injectable()
export class IngestionService {
  constructor(private readonly prisma: PrismaService) {}

  ingestStudents(body: unknown) {
    return {
      accepted: true,
      door: "ingestion",
      operation: "students",
      next: "Validate rows, match or create learners, create enrolments",
      received: body
    };
  }

  ingestResults(body: unknown) {
    return {
      accepted: true,
      door: "ingestion",
      operation: "results",
      next: "Validate rows and create Draft result batch",
      received: body
    };
  }

  createBulkUpload(body: unknown) {
    return {
      accepted: true,
      door: "ingestion",
      operation: "bulk-upload",
      received: body
    };
  }

  listBatches() {
    return this.prisma.resultBatch.findMany({
      orderBy: { createdAt: "desc" }
    });
  }

  readBatch(id: string) {
    return this.prisma.resultBatch.findUnique({
      where: { uuid: id },
      include: { academicRecords: true }
    });
  }
}
