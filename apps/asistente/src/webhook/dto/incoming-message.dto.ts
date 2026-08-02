import { IsBase64, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

// Payload normalizado que n8n envía al asistente por cada mensaje de WhatsApp.
// n8n se encarga de descargar la imagen del proveedor de WhatsApp y pasarla en base64.
export class IncomingMessageDto {
  // Identificador estable del hilo (número de WhatsApp del remitente)
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  threadId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  text?: string;

  @IsOptional()
  @IsBase64()
  imageBase64?: string;

  @IsOptional()
  @IsIn(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
  imageMediaType?: string;
}
