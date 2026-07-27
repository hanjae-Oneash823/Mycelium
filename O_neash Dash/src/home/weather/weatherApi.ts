import { fetch } from "@tauri-apps/plugin-http";

export interface GeocodeResult {
  name: string;
  admin1?: string;
  country: string;
  lat: number;
  lon: number;
}

export interface CurrentWeather {
  tempC: number;
  code: number;
  highC: number;
  lowC: number;
  /** Yesterday → today → 5 days ahead (7 entries), aligned with dailyHigh/dailyLow. */
  dailyDates: string[];
  dailyHigh: number[];
  dailyLow: number[];
}

export async function geocodeCity(query: string): Promise<GeocodeResult[]> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=en&format=json`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data: { results?: { name: string; admin1?: string; country: string; latitude: number; longitude: number }[] } = await res.json();
  return (data.results ?? []).map((r) => ({
    name: r.name,
    admin1: r.admin1,
    country: r.country,
    lat: r.latitude,
    lon: r.longitude,
  }));
}

export async function fetchCurrentWeather(lat: number, lon: number): Promise<CurrentWeather | null> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&past_days=1&forecast_days=6&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data: {
    current?: { temperature_2m: number; weather_code: number };
    daily?: { time: string[]; temperature_2m_max: number[]; temperature_2m_min: number[] };
  } = await res.json();
  if (!data.current) return null;
  const dailyDates = data.daily?.time ?? [];
  const dailyHigh   = data.daily?.temperature_2m_max ?? [];
  const dailyLow    = data.daily?.temperature_2m_min ?? [];
  // With past_days=1, index 0 is yesterday and index 1 is today.
  const todayIndex = 1;
  return {
    tempC: data.current.temperature_2m,
    code: data.current.weather_code,
    highC: dailyHigh[todayIndex] ?? data.current.temperature_2m,
    lowC: dailyLow[todayIndex] ?? data.current.temperature_2m,
    dailyDates,
    dailyHigh,
    dailyLow,
  };
}

/** WMO weather interpretation codes (Open-Meteo) → short label. */
export function describeWeatherCode(code: number): string {
  if (code === 0) return "clear";
  if (code <= 2) return "partly cloudy";
  if (code === 3) return "overcast";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 57) return "drizzle";
  if (code >= 61 && code <= 67) return "rain";
  if (code >= 71 && code <= 77) return "snow";
  if (code >= 80 && code <= 82) return "rain showers";
  if (code >= 85 && code <= 86) return "snow showers";
  if (code >= 95) return "thunderstorm";
  return "unknown";
}
