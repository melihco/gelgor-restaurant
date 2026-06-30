export interface ChatbotFaqItem {
  question: string;
  answer: string;
}

export interface ChatbotProductCategory {
  name: string;
  description?: string;
  highlights?: string[];
}

export interface ChatbotConversationRules {
  language?: string;
  tone?: string;
  greetingStyle?: string;
  doList?: string[];
  dontList?: string[];
  escalationTriggers?: string[];
}

export interface BrandChatbotProfile {
  version?: number;
  analyzedAt?: string | null;
  source?: 'auto_analysis' | 'manual' | 'seed';
  businessDisplayName?: string;
  businessHours?: string;
  address?: string;
  phone?: string;
  priceRange?: string;
  websiteUrl?: string;
  instagramHandle?: string;
  menuSummary?: string;
  productCategories?: ChatbotProductCategory[];
  shippingPolicy?: string;
  paymentMethods?: string;
  orderProcess?: string;
  faqs?: ChatbotFaqItem[];
  conversationRules?: ChatbotConversationRules;
  agentContextMarkdown?: string;
  operatorNotes?: string;
  mertcafeSyncedAt?: string | null;
  analysisConfidence?: number;
}

export interface BrandChatbotProfileRead {
  profile: BrandChatbotProfile | null;
  updatedAt: string | null;
}

export type BrandChatbotProfilePatch = Partial<
  Omit<BrandChatbotProfile, 'version' | 'analyzedAt' | 'source' | 'analysisConfidence' | 'mertcafeSyncedAt'>
>;
