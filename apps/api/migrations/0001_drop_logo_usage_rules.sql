-- Drop unused CompanyProfiles.LogoUsageRules (never wired into fal/logo placement).
ALTER TABLE "CompanyProfiles" DROP COLUMN IF EXISTS "LogoUsageRules";
