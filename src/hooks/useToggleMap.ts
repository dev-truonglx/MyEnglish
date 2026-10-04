import { useState } from "react";

/**
 * Record of boolean flags keyed by string, with a toggle that optionally stops event propagation.
 * Used for the expand/collapse state of accordion items.
 */
export function useToggleMap(): [Record<string, boolean>, (key: string, e?: React.MouseEvent) => void] {
  const [map, setMap] = useState<Record<string, boolean>>({});

  const toggle = (key: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setMap((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  return [map, toggle];
}
