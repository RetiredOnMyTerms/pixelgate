// Weather widget data. Open-Meteo — keyless and CORS-open, so we fetch it
// DIRECTLY from the browser (geocode the city name, then current conditions +
// today's high/low). No API key, nothing server-side.

export type WeatherIcon =
  | "clear" | "partly" | "cloud" | "fog" | "rain" | "snow" | "storm";

export type WeatherData = {
  city: string;
  tempC: number;
  tempF: number;
  hiC: number; hiF: number;
  loC: number; loF: number;
  windKmh: number;
  desc: string;
  icon: WeatherIcon;
};

const GEO = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST = "https://api.open-meteo.com/v1/forecast";

const cToF = (c: number) => Math.round(c * 9 / 5 + 32);

// WMO weather code -> short label + icon kind.
function classify(code: number): { desc: string; icon: WeatherIcon } {
  if (code === 0) return { desc: "Clear", icon: "clear" };
  if (code === 1 || code === 2) return { desc: "P.Cloudy", icon: "partly" };
  if (code === 3) return { desc: "Cloudy", icon: "cloud" };
  if (code === 45 || code === 48) return { desc: "Fog", icon: "fog" };
  if (code >= 51 && code <= 57) return { desc: "Drizzle", icon: "rain" };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82))
    return { desc: "Rain", icon: "rain" };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86)
    return { desc: "Snow", icon: "snow" };
  if (code >= 95) return { desc: "Storm", icon: "storm" };
  return { desc: "—", icon: "cloud" };
}

/** Geocode a city name and fetch its current weather + today's high/low.
 * Returns null if the city can't be found. Throws on a network/API failure. */
export async function fetchWeather(city: string): Promise<WeatherData | null> {
  const q = city.trim();
  if (!q) return null;
  const gr = await fetch(`${GEO}?name=${encodeURIComponent(q)}&count=1&language=en&format=json`);
  if (!gr.ok) throw new Error(`Geocoding failed (${gr.status})`);
  const gj = await gr.json();
  const loc = gj?.results?.[0];
  if (!loc) return null;

  const url =
    `${FORECAST}?latitude=${loc.latitude}&longitude=${loc.longitude}` +
    `&current=temperature_2m,weather_code,wind_speed_10m` +
    `&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Weather fetch failed (${r.status})`);
  const j = await r.json();
  const cur = j?.current;
  if (!cur) return null;

  const tempC = Math.round(cur.temperature_2m);
  const hiC = Math.round(j?.daily?.temperature_2m_max?.[0] ?? tempC);
  const loC = Math.round(j?.daily?.temperature_2m_min?.[0] ?? tempC);
  const { desc, icon } = classify(Number(cur.weather_code));
  // Prefer the geocoder's short name; fall back to what the user typed.
  const name = (loc.name || q).toString();
  return {
    city: name,
    tempC, tempF: cToF(tempC),
    hiC, hiF: cToF(hiC),
    loC, loF: cToF(loC),
    windKmh: Math.round(cur.wind_speed_10m ?? 0),
    desc, icon,
  };
}
