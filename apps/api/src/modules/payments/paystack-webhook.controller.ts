import { Body, Controller, Headers, Post, Req } from "@nestjs/common";
import { PaystackWebhookService } from "./paystack-webhook.service.js";

type RawBodyRequest = {
  rawBody?: Buffer | string;
};

@Controller("webhooks/paystack")
export class PaystackWebhookController {
  constructor(private readonly paystack: PaystackWebhookService) {}

  @Post()
  receive(@Body() body: unknown, @Headers("x-paystack-signature") signature: string | undefined, @Req() request: RawBodyRequest) {
    return this.paystack.receiveWebhook({
      payload: body,
      rawBody: request.rawBody,
      signature
    });
  }
}
