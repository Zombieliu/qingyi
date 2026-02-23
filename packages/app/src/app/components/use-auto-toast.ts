import { useCallback, useRef, useState } from "react";

/**
 * useState + auto-clear after `ms`. Cleans up on unmount / re-set.
 */
export function useAutoToast(ms = 3000) {
  const [value, setValue] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const set = useCallback(
    (msg: string | null, overrideMs?: number) => {
      if (timer.current) clearTimeout(timer.current);
      setValue(msg);
      if (msg !== null) {
        timer.current = setTimeout(() => {
          setValue(null);
          timer.current = null;
        }, overrideMs ?? ms);
      }
    },
    [ms]
  );

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setValue(null);
  }, []);

  return [value, set, clear] as const;
}
