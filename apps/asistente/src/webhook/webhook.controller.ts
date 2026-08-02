import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { AssistantService } from '../assistant/assistant.service';
import type { AssistantReply } from '../assistant/types';
import { IncomingMessageDto } from './dto/incoming-message.dto';
import { WebhookSecretGuard } from './webhook-secret.guard';

@Controller('webhook')
@UseGuards(WebhookSecretGuard)
export class WebhookController {
  constructor(private readonly assistant: AssistantService) {}

  // Punto de entrada del pipeline: n8n → POST /webhook/whatsapp → respuesta
  // con texto (y PDF adjunto en base64 cuando se genera un invoice).
  @Post('whatsapp')
  @HttpCode(200)
  async handleWhatsApp(@Body() body: IncomingMessageDto): Promise<AssistantReply> {
    return this.assistant.handleMessage({
      threadId: body.threadId,
      text: body.text ?? null,
      imageBase64: body.imageBase64 ?? null,
      imageMediaType: body.imageMediaType ?? null,
    });
  }
}
