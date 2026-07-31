import { useEffect, useState } from "react";
import { fetchDailyQuote, fetchRandomQuote, type DailyQuote } from "./quoteApi";

const VT = "var(--font-main), var(--font-kr), monospace";

export function QuotePanel() {
  const [quote, setQuote] = useState<DailyQuote | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchDailyQuote().then(setQuote);
  }, []);

  async function handleRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    const next = await fetchRandomQuote();
    setQuote(next);
    setRefreshing(false);
  }

  if (!quote) return null;

  return (
    <div
      onClick={handleRefresh}
      title="click for another quote"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
        fontFamily: VT,
        maxWidth: 720,
        cursor: "pointer",
        opacity: refreshing ? 0.5 : 1,
        transition: "opacity 0.15s ease",
      }}
    >
      <div
        style={{
          fontSize: "0.95rem",
          lineHeight: 1.45,
          color: "rgba(255,255,255,0.45)",
          fontStyle: "italic",
        }}
      >
        “{quote.text}”
      </div>
      <div
        style={{
          fontSize: "0.8rem",
          letterSpacing: 1,
          color: "rgba(255,255,255,0.25)",
        }}
      >
        — {quote.author}
      </div>
    </div>
  );
}
