import { getPosterTemplate } from './poster-template-catalog';
import { getStoryTemplate } from './story-template-catalog';
import type { TemplateColorPolicy, TemplateColorToken } from './story-template-types';

export interface TemplateColorTokensLike {
  primaryColor: string;
  accentColor: string;
  textColor: string;
  headlineColor: string;
  subtitleColor: string;
  overlayColor: string;
}

export interface ResolvedTemplateColorProps {
  headlineColor?: string;
  subtitleColor?: string;
  categoryColor?: string;
  overlayColor?: string;
  textColor?: string;
}

export type TemplateColorRole = keyof TemplateColorPolicy;

export interface TemplateColorPreviewItem {
  role: TemplateColorRole;
  label: string;
  token?: TemplateColorToken;
  tokenLabel?: string;
  color?: string;
}

export const TEMPLATE_COLOR_TOKEN_LABELS_TR: Record<TemplateColorToken, string> = {
  primary: 'Primary',
  accent: 'Accent',
  text: 'Text',
  headline: 'Headline',
  overlay: 'Overlay',
};

export const TEMPLATE_COLOR_ROLE_LABELS_TR: Record<TemplateColorRole, string> = {
  headline: 'Başlık',
  subtitle: 'Alt yazı',
  category: 'Kategori',
  overlay: 'Overlay',
  text: 'Detay yazı',
};

function appendHexAlpha(color: string, alphaHex: string): string {
  const trimmed = color.trim();
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return `${trimmed}${alphaHex}`;
  return trimmed;
}

function resolveTemplateTokenColor(
  token: TemplateColorToken | undefined,
  tokens: TemplateColorTokensLike,
  opts?: { soften?: boolean },
): string | undefined {
  switch (token) {
    case 'primary':
      return opts?.soften ? appendHexAlpha(tokens.primaryColor, 'e0') : tokens.primaryColor;
    case 'accent':
      return opts?.soften ? appendHexAlpha(tokens.accentColor, 'e0') : tokens.accentColor;
    case 'text':
      return opts?.soften ? tokens.subtitleColor : tokens.textColor;
    case 'headline':
      return opts?.soften ? tokens.subtitleColor : tokens.headlineColor;
    case 'overlay':
      return tokens.overlayColor;
    default:
      return undefined;
  }
}

export function resolveTemplateColorPolicy(
  input: { templateId?: string; posterTemplateId?: string },
): TemplateColorPolicy | undefined {
  if (input.posterTemplateId) {
    return getPosterTemplate(input.posterTemplateId)?.spec.colorPolicy;
  }
  if (input.templateId) {
    return getStoryTemplate(input.templateId)?.spec.colorPolicy;
  }
  return undefined;
}

export function resolveTemplateColorProps(
  input: {
    templateId?: string;
    posterTemplateId?: string;
    tokens: TemplateColorTokensLike;
  },
): ResolvedTemplateColorProps {
  const policy = resolveTemplateColorPolicy(input);
  if (!policy) return {};

  return {
    headlineColor: resolveTemplateTokenColor(policy.headline, input.tokens),
    subtitleColor: resolveTemplateTokenColor(policy.subtitle, input.tokens, { soften: true }),
    categoryColor: resolveTemplateTokenColor(policy.category, input.tokens),
    overlayColor: resolveTemplateTokenColor(policy.overlay, input.tokens),
    textColor: resolveTemplateTokenColor(policy.text, input.tokens),
  };
}

function resolvedColorForRole(
  role: TemplateColorRole,
  resolved: ResolvedTemplateColorProps,
): string | undefined {
  switch (role) {
    case 'headline':
      return resolved.headlineColor;
    case 'subtitle':
      return resolved.subtitleColor;
    case 'category':
      return resolved.categoryColor;
    case 'overlay':
      return resolved.overlayColor;
    case 'text':
      return resolved.textColor;
    default:
      return undefined;
  }
}

export function buildTemplateColorPreview(input: {
  templateId?: string;
  posterTemplateId?: string;
  tokens?: TemplateColorTokensLike | null;
}): {
  policy?: TemplateColorPolicy;
  items: TemplateColorPreviewItem[];
  summary: string;
} {
  const policy = resolveTemplateColorPolicy(input);
  if (!policy) {
    return {
      policy: undefined,
      items: [],
      summary: 'Template varsayilan brand renklerini kullanir.',
    };
  }

  const resolved = input.tokens
    ? resolveTemplateColorProps({
        templateId: input.templateId,
        posterTemplateId: input.posterTemplateId,
        tokens: input.tokens,
      })
    : {};

  const roleOrder: TemplateColorRole[] = ['headline', 'category', 'text', 'subtitle', 'overlay'];
  const items = roleOrder.flatMap((role) => {
    const token = policy[role];
    if (!token) return [];
    return [{
      role,
      label: TEMPLATE_COLOR_ROLE_LABELS_TR[role],
      token,
      tokenLabel: TEMPLATE_COLOR_TOKEN_LABELS_TR[token],
      color: resolvedColorForRole(role, resolved),
    }];
  });

  const summary = items.length
    ? items.map((item) => `${item.label}: ${item.tokenLabel}`).join(' · ')
    : 'Template varsayilan brand renklerini kullanir.';

  return { policy, items, summary };
}
