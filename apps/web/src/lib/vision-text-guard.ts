const VISION_DESC_PATTERNS = [
  /^(the|this)\s+(image|photo|picture|photograph)\s+(shows|depicts|features|contains|displays)/i,
  /^in\s+the\s+(image|photo|picture)/i,
  /\bthe\s+image\s+shows\b/i,
  /\bblurred\s+(outdoor|indoor)\s+background\b/i,
  /\blikely\s+near\s+water\b/i,
  /\bthe\s+setting\s+appears\s+to\s+be\b/i,
];

export function isVisionAnalysisDescription(text: string): boolean {
  const t = text.trim();
  if (t.length < 20) return false;
  return VISION_DESC_PATTERNS.some((re) => re.test(t));
}

const GALLERY_OBJECT_TAG_RE =
  /^(jar|glass|bottle|table|product|food|photo|container|packaging|label|liquid|dark|wood|surface|background)$/i;

/** Vision contentTags joined — not a marketing headline ("quince jam · jar · glass"). */
export function isGalleryTagHeadline(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  const sepCount = (t.match(/[·|•/]/g) ?? []).length;
  if (sepCount >= 2) {
    const segments = t.split(/\s*[·|•/]\s*/).map((s) => s.trim()).filter(Boolean);
    if (segments.length >= 3) {
      const short = segments.filter((s) => s.split(/\s+/).length <= 4 && s.length <= 36);
      if (short.length >= 3) return true;
    }
  }
  if (/^[A-Z0-9\s·|]+$/u.test(t) && sepCount >= 2) return true;
  return false;
}

/** Pick a product-facing headline from gallery contentTags (prefer Turkish product name). */
export function resolveProductHeadlineFromGalleryTags(
  tags: string[],
  brandName: string,
): string {
  const cleaned = tags.map((t) => String(t).trim()).filter((t) => t.length >= 3);
  const turkish = cleaned.find((t) => /[ğüşıöçĞÜŞİÖÇ]/.test(t) && t.length >= 5);
  if (turkish) {
    return turkish
      .split(/\s+/)
      .map((w) => w.charAt(0).toLocaleUpperCase('tr-TR') + w.slice(1))
      .join(' ')
      .slice(0, 72);
  }
  for (const tag of cleaned) {
    if (GALLERY_OBJECT_TAG_RE.test(tag)) continue;
    if (tag.split(/\s+/).length > 4) continue;
    return tag
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
      .slice(0, 72);
  }
  return brandName.trim() || 'Yeni Ürün';
}
