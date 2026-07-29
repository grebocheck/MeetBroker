import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength
} from "class-validator";

export class CreateBookingDto {
  @IsUUID()
  roomId!: string;

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
}
