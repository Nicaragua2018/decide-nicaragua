import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CloseTopicDto {
  @IsString()
  @MinLength(10, { message: 'Escribe la conclusión (al menos 10 caracteres).' })
  @MaxLength(2000)
  conclusion!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  objections?: string;
}
