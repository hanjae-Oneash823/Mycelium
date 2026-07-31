import { fetch } from '@tauri-apps/plugin-http';

export interface ReverseGeocodeResult {
  city: string | null;
  country: string | null;
}

interface NominatimAddress {
  city?: string;
  town?: string;
  village?: string;
  hamlet?: string;
  municipality?: string;
  county?: string;
  state?: string;
  country?: string;
}

/** Reverse-geocode coordinates into a city/country pair via Nominatim (OpenStreetMap). Never throws — returns nulls on failure. */
export async function reverseGeocode(lat: number, lng: number): Promise<ReverseGeocodeResult> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=10&addressdetails=1`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    if (!res.ok) return { city: null, country: null };
    const data: { address?: NominatimAddress } = await res.json();
    const address = data.address ?? {};
    const city = address.city ?? address.town ?? address.village ?? address.hamlet ?? address.municipality ?? address.county ?? null;
    return { city, country: address.country ?? null };
  } catch {
    return { city: null, country: null };
  }
}

/** Combine city/country into a single display string, e.g. "Kyoto, Japan". */
export function formatLocationName(result: ReverseGeocodeResult): string {
  return [result.city, result.country].filter(Boolean).join(', ');
}
