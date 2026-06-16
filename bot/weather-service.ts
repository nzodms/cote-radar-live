/**
 * Module météo (optionnel) pour l'analyse pré-match.
 *
 * Règles STRICTES :
 *  - Météo activée seulement si WEATHER_ENABLED=true ET WEATHER_API_KEY présente.
 *  - On n'INVENTE JAMAIS une température. Si la donnée manque => available=false
 *    et un message clair "météo non disponible" qui ne doit PAS être intégré au
 *    signal de paris.
 *  - Les fonctions de normalisation/formatage sont PURES (testables sans réseau).
 */

export interface WeatherConfig {
  enabled: boolean;
  apiKey: string | null;
  location: string | null;
}

export interface WeatherInfo {
  available: boolean;
  /** Raison de l'indisponibilité (si available=false). */
  reason: string | null;
  location: string | null;
  temperatureC: number | null;
  feelsLikeC: number | null;
  condition: string | null;
  description: string | null;
  windKph: number | null;
  humidityPct: number | null;
  /** Ligne d'en-tête prête à afficher (toujours fournie). */
  summary: string;
  /** Note d'impact paris (uniquement si available, sinon null). */
  impact: string | null;
}

const UNAVAILABLE_MSG = "Météo non disponible (non intégrée au signal).";

/** Lit la config météo depuis l'environnement. */
export function getWeatherConfig(): WeatherConfig {
  const enabled = (process.env.WEATHER_ENABLED ?? "").toLowerCase() === "true";
  return {
    enabled,
    apiKey: process.env.WEATHER_API_KEY || null,
    location: process.env.WEATHER_LOCATION || null,
  };
}

/** Objet météo "indisponible" homogène (jamais de température inventée). */
export function unavailableWeather(reason: string, location: string | null = null): WeatherInfo {
  return {
    available: false,
    reason,
    location,
    temperatureC: null,
    feelsLikeC: null,
    condition: null,
    description: null,
    windKph: null,
    humidityPct: null,
    summary: UNAVAILABLE_MSG,
    impact: null,
  };
}

/** Note d'impact paris prudente, déduite uniquement de données réelles. */
function weatherImpact(temperatureC: number | null, windKph: number | null, condition: string | null): string | null {
  const bits: string[] = [];
  const cond = (condition ?? "").toLowerCase();
  if (temperatureC !== null && temperatureC >= 30) {
    bits.push("forte chaleur : rythme souvent plus bas, fin de match qui peut s'ouvrir");
  } else if (temperatureC !== null && temperatureC <= 3) {
    bits.push("froid marqué : terrain plus rapide, contrôles parfois imprécis");
  }
  if (/rain|drizzle|thunderstorm|pluie|averse/.test(cond)) {
    bits.push("pluie : ballon rapide et glissant, plus d'imprécisions et d'occasions sur erreurs");
  } else if (/snow|neige/.test(cond)) {
    bits.push("neige : conditions dégradées, jeu perturbé");
  }
  if (windKph !== null && windKph >= 30) {
    bits.push("vent fort : jeu long et centres perturbés");
  }
  return bits.length > 0 ? bits.join(" · ") : null;
}

/** Construit un WeatherInfo lisible à partir d'une réponse OpenWeather (PURE). */
export function buildWeatherFromOpenWeather(raw: unknown, location: string | null): WeatherInfo {
  const r = raw as Record<string, unknown> | null;
  const main = r?.main as Record<string, unknown> | undefined;
  const wind = r?.wind as Record<string, unknown> | undefined;
  const weatherArr = r?.weather as Array<Record<string, unknown>> | undefined;
  const temp = typeof main?.temp === "number" ? (main.temp as number) : null;
  const feels = typeof main?.feels_like === "number" ? (main.feels_like as number) : null;
  const humidity = typeof main?.humidity === "number" ? (main.humidity as number) : null;
  const windMs = typeof wind?.speed === "number" ? (wind.speed as number) : null;
  const windKph = windMs !== null ? Math.round(windMs * 3.6) : null;
  const condition = (weatherArr?.[0]?.main as string) ?? null;
  const description = (weatherArr?.[0]?.description as string) ?? null;

  // Température absente => on refuse d'inventer: météo non disponible.
  if (temp === null) {
    return unavailableWeather("Donnée de température absente dans la réponse météo.", location);
  }

  const tC = Math.round(temp);
  const parts = [`🌡 ${tC}°C`];
  if (description) parts.push(description);
  else if (condition) parts.push(condition);
  if (windKph !== null) parts.push(`vent ${windKph} km/h`);
  if (humidity !== null) parts.push(`humidité ${humidity}%`);

  return {
    available: true,
    reason: null,
    location,
    temperatureC: tC,
    feelsLikeC: feels !== null ? Math.round(feels) : null,
    condition,
    description,
    windKph,
    humidityPct: humidity,
    summary: parts.join(" · "),
    impact: weatherImpact(tC, windKph, condition),
  };
}

/**
 * Récupère la météo. Best-effort: en cas de souci réseau / config absente,
 * renvoie un objet "indisponible" SANS jamais inventer de température.
 */
export async function fetchWeather(
  config: WeatherConfig = getWeatherConfig(),
  locationOverride?: string | null
): Promise<WeatherInfo> {
  const location = locationOverride || config.location;
  if (!config.enabled) return unavailableWeather("Module météo désactivé (WEATHER_ENABLED=false).", location);
  if (!config.apiKey) return unavailableWeather("WEATHER_API_KEY absente : météo non récupérée.", location);
  if (!location) return unavailableWeather("WEATHER_LOCATION absente : aucune localisation à interroger.", null);

  try {
    const url =
      `https://api.openweathermap.org/data/2.5/weather` +
      `?q=${encodeURIComponent(location)}&appid=${encodeURIComponent(config.apiKey)}&units=metric&lang=fr`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return unavailableWeather(`Service météo indisponible (HTTP ${res.status}).`, location);
    const json = await res.json();
    return buildWeatherFromOpenWeather(json, location);
  } catch (err) {
    return unavailableWeather(`Météo non récupérée (${(err as Error).message}).`, location);
  }
}

/** Ligne d'en-tête météo (toujours sûre). */
export function formatWeatherHeader(weather: WeatherInfo | null): string {
  if (!weather || !weather.available) return `🌡 ${UNAVAILABLE_MSG}`;
  return weather.summary;
}

/** Rapport météo complet pour la commande /weather (toujours sûr). */
export function composeWeatherReport(title: string, weather: WeatherInfo): string {
  const L: string[] = [];
  L.push(`🌡 Météo — ${title}`);
  if (weather.location) L.push(`Lieu : ${weather.location}`);
  if (!weather.available) {
    L.push("");
    L.push(UNAVAILABLE_MSG);
    if (weather.reason) L.push(`(${weather.reason})`);
    L.push("");
    L.push("Aucune température n'est inventée : la météo n'est pas intégrée au signal.");
    return L.join("\n");
  }
  L.push("");
  L.push(weather.summary);
  if (weather.feelsLikeC !== null) L.push(`Ressenti : ${weather.feelsLikeC}°C`);
  if (weather.impact) {
    L.push("");
    L.push(`Impact potentiel : ${weather.impact}.`);
  }
  L.push("");
  L.push("⚠️ Indicatif. La météo n'est qu'un facteur parmi d'autres.");
  return L.join("\n");
}
