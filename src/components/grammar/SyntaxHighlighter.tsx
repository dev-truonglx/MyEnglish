import { useState } from "react";
import type { SyntaxToken } from "@/types/grammar";

interface SyntaxHighlighterProps {
  tokens?: SyntaxToken[];
  fallbackText?: string;
  className?: string;
  showLabels?: boolean;
}

const ROLE_STYLES: Record<string, { bg: string; text: string; border: string; labelBg: string }> = {
  subject: {
    bg: "bg-blue-50 dark:bg-blue-950/40",
    text: "text-blue-700 dark:text-blue-300 font-semibold",
    border: "border-blue-200 dark:border-blue-800/60",
    labelBg: "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300",
  },
  verb: {
    bg: "bg-amber-50 dark:bg-amber-950/40",
    text: "text-amber-700 dark:text-amber-300 font-bold",
    border: "border-amber-200 dark:border-amber-800/60",
    labelBg: "bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300",
  },
  auxiliary: {
    bg: "bg-orange-50 dark:bg-orange-950/40",
    text: "text-orange-700 dark:text-orange-300 font-semibold",
    border: "border-orange-200 dark:border-orange-800/60",
    labelBg: "bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300",
  },
  object: {
    bg: "bg-emerald-50 dark:bg-emerald-950/40",
    text: "text-emerald-700 dark:text-emerald-300 font-medium",
    border: "border-emerald-200 dark:border-emerald-800/60",
    labelBg: "bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300",
  },
  modifier: {
    bg: "bg-purple-50 dark:bg-purple-950/40",
    text: "text-purple-700 dark:text-purple-300",
    border: "border-purple-200 dark:border-purple-800/60",
    labelBg: "bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300",
  },
  complement: {
    bg: "bg-teal-50 dark:bg-teal-950/40",
    text: "text-teal-700 dark:text-teal-300 font-medium",
    border: "border-teal-200 dark:border-teal-800/60",
    labelBg: "bg-teal-100 dark:bg-teal-900 text-teal-700 dark:text-teal-300",
  },
  connector: {
    bg: "bg-pink-50 dark:bg-pink-950/40",
    text: "text-pink-700 dark:text-pink-300 font-semibold",
    border: "border-pink-200 dark:border-pink-800/60",
    labelBg: "bg-pink-100 dark:bg-pink-900 text-pink-700 dark:text-pink-300",
  },
};

export default function SyntaxHighlighter({
  tokens,
  fallbackText,
  className = "",
  showLabels = true,
}: SyntaxHighlighterProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (!tokens || tokens.length === 0) {
    return <span className={className}>{fallbackText || ""}</span>;
  }

  return (
    <div className={`flex flex-wrap items-center gap-1.5 leading-relaxed ${className}`}>
      {tokens.map((token, index) => {
        const style = ROLE_STYLES[token.role] || {
          bg: "bg-slate-100 dark:bg-zinc-800",
          text: "text-slate-800 dark:text-zinc-200",
          border: "border-slate-200 dark:border-zinc-700",
          labelBg: "bg-slate-200 dark:bg-zinc-700 text-slate-700 dark:text-zinc-300",
        };

        const isHovered = hoveredIndex === index;

        return (
          <span
            key={index}
            onMouseEnter={() => setHoveredIndex(index)}
            onMouseLeave={() => setHoveredIndex(null)}
            className={`relative inline-flex flex-col items-center px-2 py-1 rounded-lg border transition-all cursor-pointer ${
              style.bg
            } ${style.border} ${isHovered ? "ring-2 ring-cyan-400 scale-[1.03] shadow-md z-10" : ""}`}
          >
            <span className={`text-sm ${style.text}`}>{token.text}</span>
            {showLabels && (
              <span
                className={`text-[10px] tracking-tight px-1 py-0.2 rounded mt-0.5 font-mono ${
                  style.labelBg
                }`}
              >
                {token.label}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}
