import { useCallback, useEffect, useRef, useState } from "react";

export type TerminalInputInjection = {
  paneId: string;
  token: number;
  data: string;
};

/**
 * Owns the pending injection for the selected pane. The injection is cleared once
 * the terminal has consumed it, so re-selecting or remounting the pane cannot
 * replay it. Tokens come from a ref so they stay monotonic across those clears.
 */
export function useTerminalInputInjectionSource(): {
  injection: TerminalInputInjection | null;
  injectTerminalInput: (paneId: string, data: string) => void;
} {
  const [injection, setInjection] = useState<TerminalInputInjection | null>(null);
  const tokenRef = useRef(0);
  const injectTerminalInput = useCallback((paneId: string, data: string) => {
    tokenRef.current += 1;
    setInjection({ paneId, token: tokenRef.current, data });
  }, []);
  useEffect(() => {
    if (!injection) {
      return;
    }
    setInjection(null);
  }, [injection]);
  return { injection, injectTerminalInput };
}

export function useInjectedTerminalInput(
  injectInput: { token: number; data: string } | null,
  enqueueTerminalInput: (parts: string[]) => void,
): void {
  const token = injectInput?.token ?? 0;
  const data = injectInput?.data ?? "";
  const consumedTokenRef = useRef(0);
  useEffect(() => {
    if (token === 0 || token === consumedTokenRef.current) {
      return;
    }
    consumedTokenRef.current = token;
    enqueueTerminalInput([data]);
  }, [data, enqueueTerminalInput, token]);
}
