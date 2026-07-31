import { fetch } from "@tauri-apps/plugin-http";

export interface DailyQuote {
  text: string;
  author: string;
}

const CACHE_KEY = "quote-of-the-day";

const FALLBACK_QUOTES: DailyQuote[] = [
  { text: "I change my locks every 16 days.", author: "Ron Swanson" },
  { text: "Give a man a fish and he'll eat for a day. Don't teach a man to fish, and feed yourself. He's a grown man. Fishing's not that hard.", author: "Ron Swanson" },
  { text: "There's only one thing I hate more than lying: skim milk. It's water that's lying about being milk.", author: "Ron Swanson" },
  { text: "Any dog under fifty pounds is a cat, and cats are useless.", author: "Ron Swanson" },
  { text: "Never half-ass two things. Whole-ass one thing.", author: "Ron Swanson" },
];

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** Deterministic for the daily quote (stable all day offline); random for manual refresh. */
function pickFallback(random: boolean): DailyQuote {
  if (random) {
    return FALLBACK_QUOTES[Math.floor(Math.random() * FALLBACK_QUOTES.length)];
  }
  const startOfYear = new Date(new Date().getFullYear(), 0, 0).getTime();
  const dayOfYear = Math.floor((Date.now() - startOfYear) / 86_400_000);
  return FALLBACK_QUOTES[dayOfYear % FALLBACK_QUOTES.length];
}

export async function fetchDailyQuote(): Promise<DailyQuote> {
  const key = todayKey();
  const cached = localStorage.getItem(CACHE_KEY);
  if (cached) {
    try {
      const parsed: { date: string; quote: DailyQuote } = JSON.parse(cached);
      if (parsed.date === key) return parsed.quote;
    } catch {
      // malformed cache entry, fall through to a fresh fetch
    }
  }

  try {
    const res = await fetch("https://ron-swanson-quotes.herokuapp.com/v2/quotes");
    if (!res.ok) return pickFallback(false);
    const data: string[] = await res.json();
    const first = data[0];
    if (!first) return pickFallback(false);
    const quote: DailyQuote = { text: first, author: "Ron Swanson" };
    localStorage.setItem(CACHE_KEY, JSON.stringify({ date: key, quote }));
    return quote;
  } catch {
    return pickFallback(false);
  }
}

/** Fetches a fresh random quote, bypassing the daily cache — used for click-to-refresh. */
export async function fetchRandomQuote(): Promise<DailyQuote> {
  try {
    const res = await fetch("https://ron-swanson-quotes.herokuapp.com/v2/quotes");
    if (!res.ok) return pickFallback(true);
    const data: string[] = await res.json();
    const first = data[0];
    if (!first) return pickFallback(true);
    return { text: first, author: "Ron Swanson" };
  } catch {
    return pickFallback(true);
  }
}
