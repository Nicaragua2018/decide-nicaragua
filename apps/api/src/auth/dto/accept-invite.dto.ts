import {
  IsString,
  IsUUID,
  MinLength,
  MaxLength,
  IsOptional,
  IsIn,
  Matches,
} from 'class-validator';
import { NICARAGUA_DEPARTMENTS, MIN_PASSWORD_LENGTH } from '@decide/shared';

export class AcceptInviteDto {
  @IsUUID('4', { message: 'Invalid invitation token' })
  token!: string;

  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH, {
    message: `Password must be at least ${MIN_PASSWORD_LENGTH.toString()} characters`,
  })
  @MaxLength(128, { message: 'Password must not exceed 128 characters' })
  password!: string;

  @IsString()
  @MinLength(2, { message: 'Display name must be at least 2 characters' })
  @MaxLength(50, { message: 'Display name must not exceed 50 characters' })
  @Matches(/^[\p{L}\s'\-\.]+$/u, {
    message: 'Display name contains invalid characters',
  })
  displayName!: string;

  @IsOptional()
  @IsIn([...NICARAGUA_DEPARTMENTS], {
    message: 'Must be a valid department of Nicaragua',
  })
  birthDepartment?: string;

  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Country code must be 2 characters (ISO 3166-1 alpha-2)' })
  @MaxLength(2, { message: 'Country code must be 2 characters (ISO 3166-1 alpha-2)' })
  @Matches(/^[A-Z]{2}$/, { message: 'Country must be a valid ISO 3166-1 alpha-2 code (e.g. CR, MX, US)' })
  currentCountry?: string;
}
