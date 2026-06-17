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
