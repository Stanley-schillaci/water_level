"use client";

import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  ALL_MODES,
  type DisplayMode,
  type LevelReferences,
  isModeAvailable,
} from "@/lib/levelDisplay";

const STORAGE_KEY = "lac-display-mode";
const DEFAULT_MODE: DisplayMode = "mngf";

type Ctx = {
  mode: DisplayMode;
  refs: LevelReferences;
  ready: boolean;
  setMode: (m: DisplayMode) => void;
};

const DisplayContext = createContext<Ctx | null>(null);

function readStoredMode(): DisplayMode {
  if (typeof window === "undefined") return DEFAULT_MODE;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored && (ALL_MODES as string[]).includes(stored)) return stored as DisplayMode;
  return DEFAULT_MODE;
}

export function DisplayProvider({ children }: { children: React.ReactNode }) {
  // On démarre par défaut en mNGF — pas de saut visuel à l'hydratation pour
  // les utilisateurs qui n'ont jamais changé. Le mode stocké est appliqué
  // au mount via useEffect.
  const [mode, setModeState] = useState<DisplayMode>(DEFAULT_MODE);
  const [refs, setRefs] = useState<LevelReferences>({
    ponton_calibration_mngf: null,
    min_historical: null,
  });
  const [ready, setReady] = useState(false);

  const pathname = usePathname();

  // 1. Au mount : lire le mode stocké
  useEffect(() => {
    setModeState(readStoredMode());
  }, []);

  // 2. Fetch les références à chaque navigation.
  //
  // Pourquoi pas juste au mount : le DisplayProvider est branché au layout
  // racine, donc il ne se re-mount jamais. Si l'admin modifie la calibration
  // d'un ponton (ou range l'amovible), les Client Components qui consomment
  // `refs` continueraient à voir l'ancienne valeur tant que l'utilisateur
  // ne ferait pas un hard reload. En refetch sur changement de pathname,
  // un simple aller-retour /admin → / suffit pour récupérer les bonnes refs.
  // Coût : 1 fetch léger /api/display/settings par navigation. OK.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/display/settings")
      .then((r) => r.json())
      .then((d: LevelReferences) => {
        if (cancelled) return;
        setRefs(d);
        setReady(true);
        // Si le mode stocké n'est plus dispo (calibration effacée par admin),
        // on bascule en mNGF.
        const current = readStoredMode();
        if (!isModeAvailable(current, d)) {
          setModeState(DEFAULT_MODE);
          if (typeof window !== "undefined") {
            window.localStorage.setItem(STORAGE_KEY, DEFAULT_MODE);
          }
        }
      })
      .catch(() => {
        // Pas de panic si la route échoue, on reste sur mNGF.
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const setMode = useCallback((m: DisplayMode) => {
    setModeState(m);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, m);
    }
  }, []);

  const value = useMemo<Ctx>(() => ({ mode, refs, ready, setMode }), [mode, refs, ready, setMode]);

  return <DisplayContext.Provider value={value}>{children}</DisplayContext.Provider>;
}

export function useDisplay(): Ctx {
  const ctx = useContext(DisplayContext);
  if (!ctx) {
    // Fallback safe quand le provider n'est pas branché (tests, ou composants
    // server-rendered qui n'auraient pas dû appeler le hook).
    return {
      mode: DEFAULT_MODE,
      refs: { ponton_calibration_mngf: null, min_historical: null },
      ready: false,
      setMode: () => {},
    };
  }
  return ctx;
}
