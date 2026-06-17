export interface ReelHookScoreInput {
  headline?: string;
  caption?: string;
  photoDescription?: string;
  photoSceneMoment?: string;
  photoTags?: string[];
  agentVisualDirection?: string;
  cameraMotion?: string;
  mood?: string;
}

export interface ReelHookScoreResult {
  score: number;
  reasons: string[];
  pass: boolean;
}

const HOOK_TERMS =
  /\b(new|launch|drop|reveal|best|before|after|secret|why|how|top|menu|season|opening|limited|today|tonight|now|discover|reserve|book|fresh|chef|glow|ritual|sunset|party|dj|signature)\b/i;

function clean(raw: string | undefined): string {
  return String(raw ?? '').replace(/\s+/g, ' ').trim();
}

export function scoreReelHook(input: ReelHookScoreInput): ReelHookScoreResult {
  const headline = clean(input.headline);
  const caption = clean(input.caption);
  const photoLead = clean(input.photoSceneMoment) || clean(input.photoDescription);
  const visualDirection = clean(input.agentVisualDirection);
  const tags = Array.isArray(input.photoTags) ? input.photoTags.filter(Boolean) : [];

  let score = 0;
  const reasons: string[] = [];

  if (headline.length >= 6 && headline.length <= 64) {
    score += 20;
    reasons.push('headline');
  }
  if (caption.length >= 24) {
    score += 10;
    reasons.push('caption');
  }
  if (photoLead.length >= 24) {
    score += 30;
    reasons.push('photo_grounding');
  }
  if (visualDirection.length >= 24) {
    score += 15;
    reasons.push('visual_direction');
  }
  if (tags.length >= 2) {
    score += 10;
    reasons.push('photo_tags');
  }
  if (clean(input.cameraMotion) || clean(input.mood)) {
    score += 10;
    reasons.push('motion_mood');
  }
  if (HOOK_TERMS.test(`${headline} ${caption}`)) {
    score += 10;
    reasons.push('hook_language');
  }

  const finalScore = Math.max(0, Math.min(100, score));
  return {
    score: finalScore,
    reasons,
    pass: finalScore >= 55,
  };
}
