import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class CreateBookingDto {
  @IsOptional()
  @IsUUID()
  roomId?: string;

  @IsOptional()
  @IsIn(["ROOM", "ONLINE"])
  meetingType?: "ROOM" | "ONLINE";

  @IsOptional()
  @IsUrl({ protocols: ["https"], require_protocol: true })
  @MaxLength(2048)
  meetingUrl?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  title!: string;

  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;

  @IsOptional()
  @IsIn(["INVITE_ONLY", "OPEN"])
  participationMode?: "INVITE_ONLY" | "OPEN";

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID("4", { each: true })
  participantIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(300)
  overrideReason?: string;

  @IsOptional()
  @IsIn(["NONE", "DAILY", "WEEKLY"])
  recurrence?: "NONE" | "DAILY" | "WEEKLY";

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  recurrenceInterval?: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  weekdays?: number[];

  @IsOptional()
  @IsDateString()
  recurrenceUntil?: string;
}

export class UpdateBookingDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  title!: string;

  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;

  @IsIn(["INVITE_ONLY", "OPEN"])
  participationMode!: "INVITE_ONLY" | "OPEN";

  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID("4", { each: true })
  participantIds!: string[];

  @IsOptional()
  @IsUrl({ protocols: ["https"], require_protocol: true })
  @MaxLength(2048)
  meetingUrl?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  adminReason?: string;
}

export class RespondToInvitationDto {
  @IsIn(["ACCEPTED", "DECLINED"])
  status!: "ACCEPTED" | "DECLINED";
}

export class CancelBookingDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;

  @IsOptional()
  @IsIn(["OCCURRENCE", "FUTURE"])
  scope?: "OCCURRENCE" | "FUTURE";
}
