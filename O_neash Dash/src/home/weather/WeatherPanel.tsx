import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { getWeatherLocation, setWeatherLocation, type WeatherLocation } from "./weatherLocation";
import { geocodeCity, fetchCurrentWeather, describeWeatherCode, type CurrentWeather } from "./weatherApi";
import { WeeklyTempChart, HIGH_COLOR, LOW_COLOR } from "./WeeklyTempChart";

const VT  = "var(--font-main), var(--font-kr), monospace";
const ACC = "#5eead4";

function LocationSetup({ onSet, onCancel }: { onSet: (loc: WeatherLocation) => void; onCancel?: () => void }) {
  const [query, setQuery]     = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  async function handleSubmit() {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const results = await geocodeCity(query.trim());
      if (results.length === 0) {
        setError("city not found");
        setLoading(false);
        return;
      }
      const top = results[0];
      const label = [top.name, top.admin1, top.country].filter(Boolean).join(", ");
      const loc: WeatherLocation = { name: label, lat: top.lat, lon: top.lon };
      setWeatherLocation(loc);
      onSet(loc);
    } catch {
      setError("lookup failed");
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, fontFamily: VT }}>
      <div style={{ fontSize: "0.85rem", letterSpacing: 1, color: "rgba(255,255,255,0.6)" }}>
        set weather location
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
            if (e.key === "Escape") onCancel?.();
          }}
          autoFocus
          placeholder="city name"
          style={{
            background: `${ACC}0d`,
            border: `1px solid ${ACC}44`,
            color: "#fff",
            fontFamily: VT,
            fontSize: "1rem",
            letterSpacing: 1,
            padding: "3px 8px",
            outline: "none",
            width: 130,
          }}
        />
        <button
          onClick={handleSubmit}
          disabled={loading || !query.trim()}
          style={{
            all: "unset",
            cursor: loading || !query.trim() ? "default" : "pointer",
            fontFamily: VT,
            fontSize: "0.9rem",
            letterSpacing: 1,
            color: loading || !query.trim() ? `${ACC}44` : ACC,
            textTransform: "uppercase",
          }}
        >
          set
        </button>
        {onCancel && (
          <button
            onClick={onCancel}
            style={{
              all: "unset",
              cursor: "pointer",
              fontFamily: VT,
              fontSize: "0.9rem",
              letterSpacing: 1,
              color: "rgba(255,255,255,0.4)",
              textTransform: "uppercase",
            }}
          >
            cancel
          </button>
        )}
      </div>
      {error && <div style={{ fontSize: "0.8rem", color: "#f87171" }}>{error}</div>}
    </div>
  );
}

export function WeatherPanel() {
  const [location, setLocationState] = useState<WeatherLocation | null>(null);
  const [weather, setWeather]         = useState<CurrentWeather | null>(null);
  const [loaded, setLoaded]           = useState(false);
  const [editingLocation, setEditingLocation] = useState(false);

  useEffect(() => {
    setLocationState(getWeatherLocation());
  }, []);

  useEffect(() => {
    if (!location) return;
    setLoaded(false);
    fetchCurrentWeather(location.lat, location.lon).then((w) => {
      setWeather(w);
      setLoaded(true);
    });
  }, [location]);

  if (!location || editingLocation) {
    return (
      <LocationSetup
        onSet={(loc) => { setLocationState(loc); setEditingLocation(false); }}
        onCancel={location ? () => setEditingLocation(false) : undefined}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, fontFamily: VT }}>
      <button
        onClick={() => setEditingLocation(true)}
        title="click to change location"
        style={{
          all: "unset",
          cursor: "pointer",
          fontSize: "0.85rem",
          letterSpacing: 1,
          color: "rgba(255,255,255,0.6)",
          fontFamily: VT,
        }}
      >
        {location.name}
      </button>
      {!loaded ? (
        <div style={{ fontSize: "0.9rem", color: "rgba(255,255,255,0.45)" }}>loading…</div>
      ) : weather ? (
        <>
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            style={{ display: "flex", alignItems: "flex-start", gap: 8 }}
          >
            <div style={{ fontSize: "2.2rem", color: ACC, lineHeight: 1 }}>
              {Math.round(weather.tempC)}°C
            </div>
            <div style={{ fontSize: "0.9rem", letterSpacing: 1, color: "rgba(255,255,255,0.75)" }}>
              {describeWeatherCode(weather.code)}
            </div>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: "easeOut", delay: 0.08 }}
            style={{ fontSize: "1.15rem", letterSpacing: 1, marginBottom: 6 }}
          >
            <span style={{ color: HIGH_COLOR }}>H {Math.round(weather.highC)}°C</span>
            {" / "}
            <span style={{ color: LOW_COLOR }}>L {Math.round(weather.lowC)}°C</span>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: "easeOut", delay: 0.16 }}
          >
            <WeeklyTempChart dates={weather.dailyDates} highs={weather.dailyHigh} lows={weather.dailyLow} />
          </motion.div>
        </>
      ) : (
        <div style={{ fontSize: "0.85rem", color: "#f87171" }}>couldn't reach weather service</div>
      )}
    </div>
  );
}
