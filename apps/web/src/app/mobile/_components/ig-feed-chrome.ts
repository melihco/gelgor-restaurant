export type IgFeedChrome = {
  shell: string;
  media: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  icon: string;
  separator: string;
  avatarRingBorder: string;
  avatarInnerBg: string;
  avatarInnerText: string;
  hashtag: string;
  timeLabel: string;
  publishBarBg: string;
  publishBarBorder: string;
  actionMuted: string;
};

export function resolveIgFeedChrome(dark: boolean): IgFeedChrome {
  if (dark) {
    return {
      shell: '#000',
      media: '#0a0a0a',
      text: '#fff',
      textSecondary: 'rgba(255,255,255,0.92)',
      textMuted: 'rgba(255,255,255,0.45)',
      icon: '#fff',
      separator: 'rgba(255,255,255,0.08)',
      avatarRingBorder: '#000',
      avatarInnerBg: '#222',
      avatarInnerText: '#fff',
      hashtag: '#E0F1FF',
      timeLabel: 'rgba(255,255,255,0.35)',
      publishBarBg: '#000',
      publishBarBorder: 'rgba(255,255,255,0.06)',
      actionMuted: 'rgba(255,255,255,0.55)',
    };
  }

  return {
    shell: '#fff',
    media: '#f4f4f4',
    text: '#080C10',
    textSecondary: 'rgba(8,12,16,0.88)',
    textMuted: 'rgba(8,12,16,0.45)',
    icon: '#080C10',
    separator: 'rgba(0,0,0,0.08)',
    avatarRingBorder: '#fff',
    avatarInnerBg: '#fff',
    avatarInnerText: '#080C10',
    hashtag: '#3D6880',
    timeLabel: 'rgba(8,12,16,0.38)',
    publishBarBg: '#fff',
    publishBarBorder: 'rgba(0,0,0,0.08)',
    actionMuted: 'rgba(8,12,16,0.55)',
  };
}
