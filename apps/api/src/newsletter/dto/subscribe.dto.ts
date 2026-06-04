import { IsEmail, IsOptional, IsString, MaxLength, Length } from 'class-validator';
import { Transform } from 'class-transformer';

export class SubscribeDto {
  @IsEmail({}, { message: 'Ingresa un correo electrónico válido.' })
  @Transform(({ value }: { value: string }) => value?.trim().toLowerCase())
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }: { value: string }) => value?.trim())
  name?: string;

  @IsOptional()
  @IsString()
  @Length(2, 2, { message: 'El país debe ser un código ISO de 2 letras.' })
  @Transform(({ value }: { value: string }) => value?.trim().toUpperCase())
  country?: string;
}
