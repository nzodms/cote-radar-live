/**
 * Mappe les libellés de marché/sélection d'un fournisseur de cotes vers des clés
 * internes stables. PUR (testable sans réseau).
 *
 * Tolérant: si un marché n'est pas reconnu, on renvoie null (il sera ignoré
 * plutôt que mal interprété).
 */

export type InternalMarketKey =
  | "1x2_home"
  | "1x2_draw"
  | "1x2_away"
  | "over_1_5"
  | "under_1_5"
  | "over_2_5"
  | "under_2_5"
  | "btts_yes"
  | "btts_no"
  | "next_goal_home"
  | "next_goal_away"
  | "next_goal_none"
  | "dc_home_draw"
  | "dc_away_draw"
  | "dc_home_away";

export interface MappedSelection {
  key: InternalMarketKey;
  marketLabel: string;
  selectionLabel: string;
}

const HOME = /^(home|1|domicile)$/i;
const DRAW = /^(draw|x|nul|tie)$/i;
const AWAY = /^(away|2|ext[ée]rieur)$/i;

function isMatchWinner(name: string): boolean {
  return /match winner|1x2|full time result|winner|r[ée]sultat/i.test(name) && !/half|mi-temps|double/i.test(name);
}
function isOverUnder(name: string): boolean {
  return /over\/under|goals over\/under|totals|total goals|plus\/moins/i.test(name);
}
function isBtts(name: string): boolean {
  return /both teams.*score|btts|les deux .*marqu/i.test(name);
}
function isNextGoal(name: string): boolean {
  return /next goal|prochain but/i.test(name);
}
function isDoubleChance(name: string): boolean {
  return /double chance/i.test(name);
}

/** Mappe (marché, sélection) -> clé interne, ou null si non reconnu. */
export function mapMarketSelection(marketName: string, selection: string): MappedSelection | null {
  const name = (marketName ?? "").trim();
  const sel = (selection ?? "").trim();
  if (!name || !sel) return null;

  if (isMatchWinner(name)) {
    if (HOME.test(sel)) return { key: "1x2_home", marketLabel: "1X2", selectionLabel: "Domicile" };
    if (DRAW.test(sel)) return { key: "1x2_draw", marketLabel: "1X2", selectionLabel: "Nul" };
    if (AWAY.test(sel)) return { key: "1x2_away", marketLabel: "1X2", selectionLabel: "Extérieur" };
    return null;
  }

  if (isOverUnder(name)) {
    if (/over\s*1\.5|\+1\.5/i.test(sel)) return { key: "over_1_5", marketLabel: "Over/Under 1.5", selectionLabel: "Over 1.5" };
    if (/under\s*1\.5|-1\.5/i.test(sel)) return { key: "under_1_5", marketLabel: "Over/Under 1.5", selectionLabel: "Under 1.5" };
    if (/over\s*2\.5|\+2\.5/i.test(sel)) return { key: "over_2_5", marketLabel: "Over/Under 2.5", selectionLabel: "Over 2.5" };
    if (/under\s*2\.5|-2\.5/i.test(sel)) return { key: "under_2_5", marketLabel: "Over/Under 2.5", selectionLabel: "Under 2.5" };
    return null;
  }

  if (isBtts(name)) {
    if (/^yes$|^oui$/i.test(sel)) return { key: "btts_yes", marketLabel: "BTTS", selectionLabel: "Oui" };
    if (/^no$|^non$/i.test(sel)) return { key: "btts_no", marketLabel: "BTTS", selectionLabel: "Non" };
    return null;
  }

  if (isNextGoal(name)) {
    if (HOME.test(sel)) return { key: "next_goal_home", marketLabel: "Prochain but", selectionLabel: "Domicile" };
    if (AWAY.test(sel)) return { key: "next_goal_away", marketLabel: "Prochain but", selectionLabel: "Extérieur" };
    if (/no goal|aucun|none/i.test(sel)) return { key: "next_goal_none", marketLabel: "Prochain but", selectionLabel: "Aucun" };
    return null;
  }

  if (isDoubleChance(name)) {
    if (/1x|home\/draw|domicile.*nul/i.test(sel)) return { key: "dc_home_draw", marketLabel: "Double chance", selectionLabel: "Domicile/Nul" };
    if (/x2|draw\/away|nul.*ext/i.test(sel)) return { key: "dc_away_draw", marketLabel: "Double chance", selectionLabel: "Nul/Extérieur" };
    if (/12|home\/away|domicile.*ext/i.test(sel)) return { key: "dc_home_away", marketLabel: "Double chance", selectionLabel: "Domicile/Extérieur" };
    return null;
  }

  return null;
}

/** Libellé FR court d'une clé interne. */
export function marketKeyLabel(key: InternalMarketKey): string {
  const map: Record<InternalMarketKey, string> = {
    "1x2_home": "Victoire domicile",
    "1x2_draw": "Match nul",
    "1x2_away": "Victoire extérieur",
    over_1_5: "Over 1.5",
    under_1_5: "Under 1.5",
    over_2_5: "Over 2.5",
    under_2_5: "Under 2.5",
    btts_yes: "BTTS Oui",
    btts_no: "BTTS Non",
    next_goal_home: "Prochain but domicile",
    next_goal_away: "Prochain but extérieur",
    next_goal_none: "Plus de but",
    dc_home_draw: "Double chance domicile/nul",
    dc_away_draw: "Double chance nul/extérieur",
    dc_home_away: "Double chance domicile/extérieur",
  };
  return map[key];
}
