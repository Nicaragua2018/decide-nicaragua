import {
  IsString,
  IsOptional,
  IsBoolean,
  IsIn,
  MaxLength,
  MinLength,
  Matches,
} from 'class-validator';
import { NICARAGUA_DEPARTMENTS } from '@decide/shared';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Display name must be at least 2 characters' })
  @MaxLength(50, { message: 'Display name must not exceed 50 characters' })
  @Matches(/^[\p{L}\s'\-\.]+$/u, {
    message: 'Display name contains invalid characters',
  })
  displayName?: string;

  @IsOptional()
  @IsIn([...NICARAGUA_DEPARTMENTS, null], {
    message: 'Must be a valid department of Nicaragua or null',
  })
  birthDepartment?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Country code must be 2 characters (ISO 3166-1 alpha-2)' })
  @MaxLength(2, { message: 'Country code must be 2 characters (ISO 3166-1 alpha-2)' })
  @Matches(/^[A-Z]{2}$/, {
    message: 'Country must be a valid ISO 3166-1 alpha-2 code (e.g. CR, MX, US)',
  })
  currentCountry?: string | null;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}
