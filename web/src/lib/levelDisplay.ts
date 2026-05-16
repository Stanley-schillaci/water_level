/**
 * Référentiels et formatage du niveau d'eau.
 *
 * Le SOCKET de données reste toujours en mètres NGF (mNGF) dans la DB ;
 * cette lib convertit + formate pour l'affichage uniquement.
 *
 * 3 référentiels :
 *  - "mngf"   : valeur brute (ex: 666.97 m)
 *  - "ponton" : valeur - calibration ponton (ex: 2.30 m sous la coque)
 *  - "min"    : valeur - minimum historique (ex: 12.7 m depuis le minimum)
 */

export type DisplayMode = "mngf" | "ponton" | "min";

export type LevelReferences = {
  ponton_calibration_mngf: number | null;
  min_historical: { value: number; date: string } | null;
};

export const ALL_MODES: DisplayMode[] = ["mngf", "ponton", "min"];

export const MODE_LABELS: Record<DisplayMode, string> = {
  mngf: "Altitude (mNGF)",
  ponton: "Sous le ponton",
  min: "Depuis le minimum historique",
};

export const MODE_SHORT_LABELS: Record<DisplayMode, string> = {
  mngf: "mNGF",
  ponton: "sous la coque",
  min: "depuis le min.",
};

/**
 * Convertit une valeur mNGF vers le mode demandé.
 * Retourne null si la conversion n'est pas possible (ex: ponton sans calibration).
 */
export function convertValue(
  value_mngf: number,
  mode: DisplayMode,
  refs: LevelReferences,
): number | null {
  switch (mode) {
    case "mngf":
      return value_mngf;
    case "ponton":
      if (refs.ponton_calibration_mngf === null) return null;
      return value_mngf - refs.ponton_calibration_mngf;
    case "min":
      if (refs.min_historical === null) return null;
      return value_mngf - refs.min_historical.value;
  }
}

/**
 * Indique si un mode est utilisable (vraies données dispo).
 */
export function isModeAvailable(mode: DisplayMode, refs: LevelReferences): boolean {
  if (mode === "mngf") return true;
  if (mode === "ponton") return refs.ponton_calibration_mngf !== null;
  if (mode === "min") return refs.min_historical !== null;
  return false;
}

/**
 * Format une valeur mNGF dans le mode demandé.
 * - mngf : "666.97 m"
 * - ponton : "2,30 m" ou "−15 cm" si négatif/petit
 * - min : "12,7 m"
 *
 * Si le mode n'est pas dispo, fallback en mNGF (avec suffixe explicite).
 */
export function formatLevel(
  value_mngf: number,
  mode: DisplayMode,
  refs: LevelReferences,
): string {
  const converted = convertValue(value_mngf, mode, refs);
  if (converted === null) {
    // fallback
    return `${value_mngf.toFixed(2)} m`;
  }
  // En mNGF on garde 2 décimales. En relatif on adapte selon la magnitude.
  if (mode === "mngf") return `${converted.toFixed(2)} m`;
  return formatRelativeMeters(converted);
}

/**
 * Formate un delta (m), avec auto-switch m↔cm si |delta| < 1 m.
 * Toujours signé (+ ou −).
 */
export function formatDelta(delta_m: number): string {
  const abs = Math.abs(delta_m);
  if (abs < 1) {
    const cm = Math.round(delta_m * 100);
    return `${cm >= 0 ? "+" : ""}${cm} cm`;
  }
  return `${delta_m >= 0 ? "+" : ""}${delta_m.toFixed(2)} m`;
}

/**
 * Pour les valeurs absolues dans un référentiel relatif. Format :
 *  - |v| >= 1 m  : "2,30 m" (1 ou 2 décimales selon magnitude)
 *  - |v| < 1 m   : "23 cm"
 * Le signe est préservé (− pour négatif, rien pour positif).
 */
export function formatRelativeMeters(value_m: number): string {
  const abs = Math.abs(value_m);
  if (abs < 1) {
    const cm = Math.round(value_m * 100);
    return `${cm} cm`;
  }
  if (abs < 10) return `${value_m.toFixed(2)} m`;
  return `${value_m.toFixed(1)} m`;
}

/**
 * Label court d'unité pour les axes Y et tooltips ECharts.
 */
export function unitLabel(mode: DisplayMode): string {
  switch (mode) {
    case "mngf":
      return "m NGF";
    case "ponton":
      return "m sous coque";
    case "min":
      return "m depuis min.";
  }
}
