import type { RemotionLayoutFamily } from '@/lib/remotion-template-types';
import type { ProductionSlotRole } from '@/lib/mission-production-manifest';
import type { StorySequenceRole } from '@/lib/story-sequence-rules';

export type PremiumCompositionMeta = {
  compositionType: string;
  visualPriority?: string;
  typographyApproach?: string;
  objectTreatment?: string;
  graphicElements?: string[];
  layoutStrategy?: string;
  compositionDescription?: string;
  creativeDirection?: string;
  premiumScore?: number;
  visualStory?: string;
  motionApproach?: string;
};

export type StoryCandidate = {
  headline: string;
  caption: string;
  voiceoverCaption?: string;
  photoUrl: string;
  galleryPhotoUrls?: string[];
  galleryLayout?: 'dual' | 'triple' | 'sequence';
  artifactId: string;
  ideaId?: string;
  treatment?: string;
  mood?: string;
  templateUseCase?: string;
  event_details?: Record<string, string>;
  sceneBriefBlock?: string;
  preferredLayoutFamily?: RemotionLayoutFamily;
  slotRole?: ProductionSlotRole;
  publishChannel?: string;
  ideaIndex?: number;
  librarySlotKey?: string;
  storySequenceRole?: StorySequenceRole;
  galleryMatchScore?: number | null;
  premiumComposition?: PremiumCompositionMeta | null;
};

export type PostCandidate = {
  headline: string;
  caption: string;
  photoUrl: string;
  artifactId: string;
  ideaId?: string;
  ideaIndex?: number;
  treatment?: string;
  mood?: string;
  templateUseCase?: string;
  event_details?: Record<string, string>;
  premiumComposition?: PremiumCompositionMeta | null;
};
