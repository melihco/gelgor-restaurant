/**
 * Regenerate apps/web/src/lib/story-music-tracks.generated.ts (100 modern/fun BGM tracks).
 * Usage: node scripts/generate-story-music-catalog.mjs
 */
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '../apps/web/src/lib/story-music-tracks.generated.ts');

const keywords = [
  'pop', 'house', 'electronic', 'funk', 'disco', 'edm', 'dance', 'upbeat', 'happy', 'summer',
  'party', 'club', 'groove', 'vibe', 'trap', 'phonk', 'synth', 'retro', 'latin', 'tropical',
  'future', 'bass', 'deep', 'corporate', 'commercial', 'fashion', 'lifestyle', 'vlog', 'tiktok',
  'reels', 'modern', 'fun', 'energetic', 'positive', 'bright', 'urban', 'night', 'beach',
  'afro', 'reggaeton', 'brazil', 'anime', 'sport', 'workout', 'neon', 'cyber', 'tech',
  'digital', 'space', 'dream', 'city', 'island', 'paradise', 'luxury',
];

const tracks = new Map();
const re = /href=['"]?(\/music\/[^'"]+?\.mp3)['"]?[^>]*download=['"]([^'"]+)['"]/gi;

const ARTIST_PREFIXES = [
  'alex-productions-', 'fsm-team-escp-', 'fsm-team-', 'surf-house-productions-',
  'corporate-music-zone-', 'mixaund-', 'roa-music-', 'scandinavianz-',
  'mike-leite-', 'maxkomusic-', 'le-gang-', 'glitch-', 'peyruis-', 'balynt-',
  'ghostrifter-official-', 'punch-deck-', 'sakura-hz-', 'shane-ivers-', 'scott-buckley-',
  'electronic-senses-', 'foxxy-mulderr-', 'groove-bakery-', 'justin-allan-arnold-',
  'sound-effects-library-',
];

function shortLabel(id) {
  let s = id;
  for (const p of ARTIST_PREFIXES) {
    if (s.startsWith(p)) s = s.slice(p.length);
  }
  return s.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function categoryFromId(id) {
  const s = id.toLowerCase();
  if (/house|edm|club|dance|tropical|deep|future|bass|phonk|trap|nightclub/.test(s)) return 'dance';
  if (/funk|disco|groove|reggaeton|afro|latin|brazil/.test(s)) return 'funk';
  if (/pop|upbeat|happy|positive|bright|commercial|corporate|fashion|fun/.test(s)) return 'pop';
  if (/synth|retro|cyber|neon|anime|game/.test(s)) return 'synth';
  if (/chill|ambient|lofi|yoga|coffee/.test(s)) return 'chill';
  if (/beach|summer|island|tropical|paradise|waves|sun/.test(s)) return 'summer';
  if (/sport|workout|energy|stomp|drum|trap-sport/.test(s)) return 'energy';
  return 'modern';
}

const CATEGORY_LABELS = {
  dance: 'Dans & Club',
  pop: 'Pop & Upbeat',
  funk: 'Funk & Groove',
  synth: 'Synth & Cyber',
  chill: 'Chill & Lo-Fi',
  summer: 'Tropical & Yaz',
  energy: 'Enerji & Spor',
  modern: 'Modern',
};

async function scrapeSearch(q) {
  const url = `https://www.free-stock-music.com/search.php?keyword=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await res.text();
  let m;
  while ((m = re.exec(html)) !== null) {
    const path = m[1].replace(/['"].*/, '');
    const filename = m[2];
    const id = filename.replace(/\.mp3$/i, '');
    const urlFull = `https://www.free-stock-music.com${path}`;
    if (!tracks.has(id)) {
      const category = categoryFromId(id);
      tracks.set(id, {
        id,
        label: shortLabel(id),
        url: urlFull,
        category,
        categoryLabel: CATEGORY_LABELS[category] || 'Modern',
      });
    }
  }
}

for (const q of keywords) {
  await scrapeSearch(q);
  process.stdout.write(`${q}:${tracks.size} `);
}

const priority = ['dance', 'pop', 'funk', 'synth', 'summer', 'energy', 'modern', 'chill'];
const picked = [...tracks.values()]
  .sort((a, b) => priority.indexOf(a.category) - priority.indexOf(b.category))
  .slice(0, 100);

const content = `/**
 * Auto-generated story BGM catalog — 100 modern / fun royalty-free tracks.
 * Source: free-stock-music.com (CC BY / CC BY-SA — check per-track license).
 * Regenerate: node scripts/generate-story-music-catalog.mjs
 */
export type StoryMusicCategory =
  | 'dance'
  | 'pop'
  | 'funk'
  | 'synth'
  | 'chill'
  | 'summer'
  | 'energy'
  | 'modern';

export interface StoryMusicTrack {
  id: string;
  label: string;
  url: string;
  category: StoryMusicCategory;
  categoryLabel: string;
}

export const STORY_MUSIC_TRACKS: StoryMusicTrack[] = ${JSON.stringify(picked, null, 2)} as StoryMusicTrack[];

export const STORY_MUSIC_CATEGORY_LABELS: Record<StoryMusicCategory, string> = ${JSON.stringify(CATEGORY_LABELS, null, 2)} as Record<StoryMusicCategory, string>;
`;

writeFileSync(OUT, content, 'utf8');
console.log(`\nWrote ${picked.length} tracks → ${OUT}`);
