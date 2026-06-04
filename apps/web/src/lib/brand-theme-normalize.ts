/** Normalize brand_theme AI fields (snake_case from Python + camelCase from UI). */

const AI_KEYS_SNAKE = [
  'ai_photo_enhance',
  'ai_photo_enhance_level',
  'ai_use_brand_identity',
  'ai_brief_drives_scene',
  'ai_embed_logo',
  'ai_enhance_formats',
  'ai_visual_subject',
  'enable_visual_production_director',
] as const;

const CAMEL_TO_SNAKE: Record<string, string> = {
  aiPhotoEnhance: 'ai_photo_enhance',
  aiPhotoEnhanceLevel: 'ai_photo_enhance_level',
  aiUseBrandIdentity: 'ai_use_brand_identity',
  aiBriefDrivesScene: 'ai_brief_drives_scene',
  aiEmbedLogo: 'ai_embed_logo',
  aiEnhanceFormats: 'ai_enhance_formats',
  aiVisualSubject: 'ai_visual_subject',
  enableVisualProductionDirector: 'enable_visual_production_director',
};

export function normalizeBrandThemeRecord(
  theme: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!theme || typeof theme !== 'object') return {};
  const out = { ...theme };
  for (const snake of AI_KEYS_SNAKE) {
    if (out[snake] !== undefined && out[snake] !== null) continue;
    const camel = snake.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    if (out[camel] !== undefined && out[camel] !== null) {
      out[snake] = out[camel];
    }
  }
  for (const [camel, snake] of Object.entries(CAMEL_TO_SNAKE)) {
    if (out[snake] !== undefined && out[snake] !== null) continue;
    if (out[camel] !== undefined && out[camel] !== null) {
      out[snake] = out[camel];
    }
  }
  return out;
}
