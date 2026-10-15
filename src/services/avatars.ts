/**
 * Preset avatars: an emoji on a coloured disc. Only the short id is stored on the profile (and returned by the
 * leaderboard), so a ranking of 50 people costs a few bytes for faces. Unknown or missing ids fall back to the
 * first letter of the name, so an avatar added or removed later never breaks a screen.
 */

/** Tailwind classes are spelled out in full so the build sees them */
const DISC = {
  amber: "bg-amber-100 dark:bg-amber-500/25",
  rose: "bg-rose-100 dark:bg-rose-500/25",
  orange: "bg-orange-100 dark:bg-orange-500/25",
  slate: "bg-slate-200 dark:bg-slate-500/30",
  violet: "bg-violet-100 dark:bg-violet-500/25",
  emerald: "bg-emerald-100 dark:bg-emerald-500/25",
  sky: "bg-sky-100 dark:bg-sky-500/25",
  pink: "bg-pink-100 dark:bg-pink-500/25",
  cyan: "bg-cyan-100 dark:bg-cyan-500/25",
  yellow: "bg-yellow-100 dark:bg-yellow-500/25",
  blue: "bg-blue-100 dark:bg-blue-500/25",
  purple: "bg-purple-100 dark:bg-purple-500/25",
  green: "bg-green-100 dark:bg-green-500/25",
  indigo: "bg-indigo-100 dark:bg-indigo-500/25",
  teal: "bg-teal-100 dark:bg-teal-500/25",
  lime: "bg-lime-100 dark:bg-lime-500/25",
} as const;

export interface AvatarPreset {
  id: string;
  emoji: string;
  label: string;
  disc: string;
}

const make = (key: string, emoji: string, label: string, color: keyof typeof DISC): AvatarPreset => ({
  id: `${key}-${color}`,
  emoji,
  label,
  disc: DISC[color],
});

export const AVATARS: readonly AvatarPreset[] = [
  make("fox", "🦊", "Cáo", "amber"),
  make("cat", "🐱", "Mèo", "rose"),
  make("dog", "🐶", "Chó", "orange"),
  make("panda", "🐼", "Gấu trúc", "slate"),
  make("owl", "🦉", "Cú", "violet"),
  make("frog", "🐸", "Ếch", "emerald"),
  make("koala", "🐨", "Koala", "sky"),
  make("rabbit", "🐰", "Thỏ", "pink"),
  make("penguin", "🐧", "Cánh cụt", "cyan"),
  make("lion", "🦁", "Sư tử", "yellow"),
  make("whale", "🐳", "Cá voi", "blue"),
  make("unicorn", "🦄", "Kỳ lân", "purple"),
  make("dragon", "🐲", "Rồng", "green"),
  make("robot", "🤖", "Robot", "slate"),
  make("rocket", "🚀", "Tên lửa", "indigo"),
  make("bulb", "💡", "Bóng đèn", "yellow"),
  make("book", "📚", "Sách", "teal"),
  make("laptop", "💻", "Laptop", "sky"),
  make("coffee", "☕", "Cà phê", "orange"),
  make("cactus", "🌵", "Xương rồng", "lime"),
];

/** The ids the server accepts have this shape (the same check as the profiles column) */
export const AVATAR_ID_PATTERN = /^[a-z0-9-]{1,24}$/;

export function findAvatar(id: string | null | undefined): AvatarPreset | null {
  return AVATARS.find((a) => a.id === id) ?? null;
}

/** Colours the fallback disc by name so the same person always gets the same one */
const FALLBACK_DISCS = Object.values(DISC);

export function fallbackDisc(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return FALLBACK_DISCS[h % FALLBACK_DISCS.length];
}

/** First letter of the name, upper-cased ("?" for an empty name) */
export function initialOf(name: string): string {
  const ch = Array.from(name.trim())[0];
  return ch ? ch.toUpperCase() : "?";
}
