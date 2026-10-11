import { useEffect, useState } from "react";
import { isSimpleMode } from "@/services/learnerProfile";

/** Whether simple mode is on; re-renders when the learner switches it in Settings */
export function useSimpleMode(): boolean {
  const [simple, setSimple] = useState(isSimpleMode);
  useEffect(() => {
    const sync = () => setSimple(isSimpleMode());
    window.addEventListener("myenglish-profile-updated", sync);
    return () => window.removeEventListener("myenglish-profile-updated", sync);
  }, []);
  return simple;
}

interface JargonProps {
  /** Technical label, shown when simple mode is off */
  term: string;
  /** Plain Vietnamese label, shown in simple mode */
  plain: string;
  /** Short Vietnamese explanation, shown as a tooltip on the technical label */
  hint?: string;
  className?: string;
}

/** A technical term for advanced users; beginners see the plain word instead */
export default function Jargon({ term, plain, hint, className }: JargonProps) {
  const simple = useSimpleMode();
  if (simple) return <span className={className}>{plain}</span>;
  return (
    <span
      title={hint}
      className={`${className ?? ""} cursor-help underline decoration-dotted decoration-slate-400 underline-offset-2`.trim()}
    >
      {term}
    </span>
  );
}
