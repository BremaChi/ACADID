import { Module } from "@nestjs/common";
import { PlatformServicesModule } from "../platform/platform-services.module.js";
import { PaystackWebhookController } from "./paystack-webhook.controller.js";
import { PaystackWebhookService } from "./paystack-webhook.service.js";

@Module({
  imports: [PlatformServicesModule],
  controllers: [PaystackWebhookController],
  providers: [PaystackWebhookService],
  exports: [PaystackWebhookService]
})
export class PaymentsModule {}
