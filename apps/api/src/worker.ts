import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { JobWorkerService } from "./modules/jobs/job-worker.service.js";
import { WorkerModule } from "./modules/worker.module.js";

async function bootstrap() {
  const logger = new Logger("AcadIDWorker");
  const app = await NestFactory.createApplicationContext(WorkerModule, { logger: ["error", "warn", "log"] });
  const worker = app.get(JobWorkerService);
  const once = process.argv.includes("--once") || process.env.ACADID_WORKER_ONCE === "true";
  const intervalMs = Number(process.env.ACADID_WORKER_INTERVAL_MS ?? 5000);
  const batchSize = Number(process.env.ACADID_WORKER_BATCH_SIZE ?? 5);

  const shutdown = async () => {
    logger.log("Stopping AcadID worker.");
    await app.close();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  try {
    const result = await worker.startLoop({ once, intervalMs, batchSize });
    if (once) {
      logger.log(`Worker once processed ${result?.processed ?? 0} job(s).`);
      await app.close();
    }
  } catch (error) {
    logger.error(error instanceof Error ? error.stack : String(error));
    await app.close();
    process.exitCode = 1;
  }
}

void bootstrap();
