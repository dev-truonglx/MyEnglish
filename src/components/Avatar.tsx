import { cn } from "@/lib/utils";
import { fallbackDisc, findAvatar, initialOf } from "@/services/avatars";

const SIZES = {
  xs: "w-5 h-5 text-[11px]",
  sm: "w-7 h-7 text-sm",
  md: "w-10 h-10 text-xl",
  lg: "w-16 h-16 text-3xl",
} as const;

/** A profile's avatar: the chosen preset, or the name's first letter when none is set */
export default function Avatar({ id, name, size = "md", className }: { id?: string | null; name: string; size?: keyof typeof SIZES; className?: string }) {
  const preset = findAvatar(id);
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex items-center justify-center rounded-full shrink-0 select-none leading-none",
        SIZES[size],
        preset ? preset.disc : cn(fallbackDisc(name), "font-bold text-slate-700 dark:text-zinc-200"),
        className
      )}
    >
      {preset ? preset.emoji : initialOf(name)}
    </span>
  );
}
