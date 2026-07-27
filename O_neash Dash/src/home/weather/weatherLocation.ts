export interface WeatherLocation {
  name: string;
  lat: number;
  lon: number;
}

const STORAGE_KEY = "oneash-weather-location";

export function getWeatherLocation(): WeatherLocation | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.name === "string" && Number.isFinite(parsed?.lat) && Number.isFinite(parsed?.lon)) {
      return parsed as WeatherLocation;
    }
  } catch {
    /* corrupt value — treat as unset */
  }
  return null;
}

export function setWeatherLocation(location: WeatherLocation): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(location));
}
