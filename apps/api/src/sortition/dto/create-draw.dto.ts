import { IsString, IsOptional, IsInt, Min, Max, MinLength, MaxLength } from 'class-validator';

export class CreateDrawDto {
  @IsString()
  @MinLength(5)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  /** Número de miembros a seleccionar. Debe ser >= 1. */
  @IsInt()
  @Min(1)
  @Max(500)
  selectionSize!: number;
}
