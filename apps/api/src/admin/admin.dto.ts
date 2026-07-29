import {
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength
} from "class-validator";
import { Type } from "class-transformer";

export class RestrictUserDto {
  @IsString()
  @IsIn([
    "BOOKING_CREATE",
    "BOOKING_CANCEL_OWN",
    "SCHEDULE_VIEW",
    "ACCOUNT_LOGIN"
  ])
  capability!: string;

  @IsOptional()
  @IsUUID()
  roomId?: string;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;
}

export class RevokeAccessDto {
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;
}

export class UpdateRoleDto {
  @IsIn(["USER", "ADMIN"])
  role!: "USER" | "ADMIN";
}

export class CreateRoomDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(200)
  floor!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  capacity!: number;

  @IsOptional()
  @IsString()
  workStart?: string;

  @IsOptional()
  @IsString()
  workEnd?: string;
}

export class UpdateRoomDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(200)
  floor?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  capacity?: number;

  @IsOptional()
  @IsString()
  workStart?: string;

  @IsOptional()
  @IsString()
  workEnd?: string;
}

export class CreateRoomBlockDto {
  @IsUUID()
  roomId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  privateNote?: string;

  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;
}
