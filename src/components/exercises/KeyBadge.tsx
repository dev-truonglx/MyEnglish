/** Number badge of a matching item: the key that picks it */
export default function KeyBadge({ number, className }: { number: number; className: string }) {
  return (
    <kbd className={`w-7 h-7 shrink-0 rounded-lg hidden md:flex items-center justify-center text-sm font-bold font-mono border ${className}`}>
      {number}
    </kbd>
  );
}
