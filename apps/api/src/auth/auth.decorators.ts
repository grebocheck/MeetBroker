import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC = "isPublic";
export const REQUIRE_APPROVED = "requireApproved";
export const REQUIRE_ADMIN = "requireAdmin";

export const Public = () => SetMetadata(IS_PUBLIC, true);
export const Approved = () => SetMetadata(REQUIRE_APPROVED, true);
export const AdminOnly = () => SetMetadata(REQUIRE_ADMIN, true);
