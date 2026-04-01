import { IsEmail } from 'class-validator';

export class InviteUserDto {
  @IsEmail({}, { message: 'Must be a valid email address' })
  email!: string;
}
