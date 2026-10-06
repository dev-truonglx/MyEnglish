import { Clock } from "lucide-react";
import type { ReviewTimeBucket } from "@/utils/reviewSchedule";

interface ReviewTimeFilterBarProps {
  selectedBucket: ReviewTimeBucket;
  onSelectBucket: (bucket: ReviewTimeBucket) => void;
  bucketCounts: Record<ReviewTimeBucket, number>;
}

interface BucketConfig {
  id: ReviewTimeBucket;
  label: string;
  icon?: React.ReactNode;
  activeClass: string;
}

const BUCKET_CONFIGS: BucketConfig[] = [
  {
    id: "all",
    label: "Tất cả",
    activeClass:
      "bg-slate-900 dark:bg-white text-white dark:text-zinc-900 border-slate-900 dark:border-white shadow-sm font-semibold",
  },
  {
    id: "due",
    label: "Đến hạn",
    activeClass:
      "bg-rose-600 text-white border-rose-600 shadow-sm font-semibold",
  },
  {
    id: "today",
    label: "Hôm nay",
    activeClass:
      "bg-amber-600 text-white border-amber-600 shadow-sm font-semibold",
  },
  {
    id: "1-3d",
    label: "1 - 3 ngày",
    activeClass:
      "bg-cyan-600 text-white border-cyan-600 shadow-sm font-semibold",
  },
  {
    id: "4-7d",
    label: "4 - 7 ngày",
    activeClass:
      "bg-teal-600 text-white border-teal-600 shadow-sm font-semibold",
  },
  {
    id: "future",
    label: "> 7 ngày",
    activeClass:
      "bg-indigo-600 text-white border-indigo-600 shadow-sm font-semibold",
  },
  {
    id: "new",
    label: "Chưa học",
    activeClass:
      "bg-slate-700 dark:bg-zinc-700 text-white border-slate-700 shadow-sm font-semibold",
  },
];

export default function ReviewTimeFilterBar({
  selectedBucket,
  onSelectBucket,
  bucketCounts,
}: ReviewTimeFilterBarProps) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none py-1">
      <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-zinc-400 font-mono shrink-0 pr-1 select-none">
        <Clock className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
        <span>Lịch nhắc lại:</span>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {BUCKET_CONFIGS.map((config) => {
          const isSelected = selectedBucket === config.id;
          const count = bucketCounts[config.id] || 0;

          // Don't clutter with 0-count items except 'all' and 'due'
          if (count === 0 && config.id !== "all" && config.id !== "due" && !isSelected) {
            return null;
          }

          return (
            <button
              key={config.id}
              onClick={() => onSelectBucket(config.id)}
              className={`px-2.5 py-1.5 rounded-xl text-xs shrink-0 transition-all flex items-center gap-1.5 border ${
                isSelected
                  ? config.activeClass
                  : "bg-white dark:bg-zinc-900/80 text-slate-600 dark:text-zinc-400 border-slate-200 dark:border-zinc-800 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 shadow-sm"
              }`}
            >
              {config.id === "due" && count > 0 && (
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
              )}
              <span>{config.label}</span>
              <span
                className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full border ${
                  isSelected
                    ? "bg-black/20 text-white border-transparent"
                    : "bg-slate-100 dark:bg-zinc-800/80 text-slate-700 dark:text-zinc-300 border-slate-200 dark:border-zinc-700/50"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
