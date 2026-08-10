import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class SignupDto {
  @IsEmail({}, { message: 'Enter a valid email address.' })
  @MaxLength(320)
  email!: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters.' })
  @MaxLength(72, {
    // bcrypt silently ignores bytes past 72, so a longer password would give a
    // false sense of strength. Rejecting is clearer than truncating.
    message: 'Password must be at most 72 characters.',
  })
  password!: string;
}

export class LoginDto {
  @IsEmail({}, { message: 'Enter a valid email address.' })
  email!: string;

  @IsString()
  @MinLength(1, { message: 'Password is required.' })
  password!: string;
}
