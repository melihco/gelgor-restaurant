-- Drop unused CompanyProfiles.BrandImageUrls (gallery uses brand_context.reference_image_urls).
ALTER TABLE "CompanyProfiles" DROP COLUMN IF EXISTS "BrandImageUrls";
