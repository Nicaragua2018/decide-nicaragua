import { IsOptional, IsString, IsDateString, IsInt, Min, Max, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryAuditEventsDto {
  /**
   * Filtro de acción por prefijo exacto o completo.
   * Ejemplos: "user.", "vote.cast", "proposal."
   */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  action?: string;

  /**
   * Filtro por recurso afectado. Exacto.
   * Ejemplo: "proposal:uuid-xxx"
   */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  resource?: string;

  /** Fecha de inicio del rango (inclusive). ISO 8601. */
  @IsOptional()
  @IsDateString()
  from?: string;

  /** Fecha de fin del rango (inclusive). ISO 8601. */
  @IsOptional()
  @IsDateString()
  to?: string;

  /** Número de página (base 1). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  /** Eventos por página. Máximo 100. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
