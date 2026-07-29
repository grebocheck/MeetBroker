import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength
} from "class-validator";
import type { Locale, Theme } from "../common/types";

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  bio?: string;

  @IsOptional()
  @IsString()
  @IsIn([
    "avatar-01",
    "avatar-02",
    "avatar-03",
    "avatar-04",
    "avatar-05",
    "avatar-06",
    "avatar-07",
    "avatar-08",
    "avatar-09",
    "avatar-10",
    "avatar-11",
    "avatar-12"
  ])
  avatarPreset?: string;

  @IsOptional()
  @IsIn(["uk", "en"])
  locale?: Locale;

  @IsOptional()
  @IsIn(["SYSTEM", "LIGHT", "DARK"])
  theme?: Theme;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  timezone?: string;
}
