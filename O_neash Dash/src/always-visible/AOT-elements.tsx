import { useState, useEffect, useRef } from "react";
import SingleBloomNav from "./SingleBloomNavigator/SingleBloomNav";
import usePluginStore from "../store/usePluginStore";
import { Home } from "pixelarticons/react";
import { CATEGORIES } from "../home/LaunchMenu";
import { SpeakYourMindInput } from "../widgets/widgets/SpeakYourMind";
import "./AOT-elements.css";

// Flatten all launchable apps from categories, keeping icon + accent color
const ALL_APPS = CATEGORIES.flatMap((cat) =>
  cat.apps
    .filter((app) => app.pluginId)
    .map((app) => ({ ...app, accent: cat.accent }))
);

function AotMenu() {
  const setActivePlugin = usePluginStore((state) => state.setActivePlugin);
  const activePlugin = usePluginStore((state) => state.activePlugin);
  const [isOpen, setIsOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const menuRef  = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const recentApps = recent
    .map((id) => ALL_APPS.find((a) => a.pluginId === id))
    .filter(Boolean) as typeof ALL_APPS;

  // Track recently visited plugins
  useEffect(() => {
    if (activePlugin !== null) {
      setRecent((prev) => {
        const filtered = prev.filter((id) => id !== activePlugin);
        return [activePlugin, ...filtered].slice(0, 3);
      });
    }
  }, [activePlugin]);

  // Slide out when cursor hits the left edge within the panel's Y range
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (e.clientX > 4) return;
      const rect = panelRef.current?.getBoundingClientRect();
      if (!rect) return;
      if (e.clientY >= rect.top && e.clientY <= rect.bottom) setIsOpen(true);
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  const navigate = (id: string | null) => {
    setActivePlugin(id);
    setIsOpen(false);
  };

  return (
    <div
      className={`aot-menu-wrapper${isOpen ? " is-open" : ""}`}
      ref={menuRef}
      onMouseLeave={() => setIsOpen(false)}
    >
      <div className="aot-menu-panel" ref={panelRef}>

        <button className="aot-menu-item aot-menu-home" onClick={() => navigate(null)}>
          <Home className="aot-menu-item-icon" />
          <span>HOMEPAGE</span>
        </button>

        {recentApps.length > 0 && (
          <>
            <div className="aot-menu-section-label">[recent]</div>
            {recentApps.map((app, i) => (
              <button
                key={app.pluginId}
                className="aot-menu-item"
                style={{ color: app.accent }}
                onClick={() => navigate(app.pluginId!)}
              >
                <span className="aot-menu-item-num">{i + 1}</span>
                <span className="aot-menu-item-icon">{app.icon}</span>
                <span>{app.label.toUpperCase()}</span>
              </button>
            ))}
          </>
        )}

        <div className="aot-menu-section-label">[all]</div>
        {ALL_APPS.map((app) => (
          <button
            key={app.pluginId}
            className="aot-menu-item"
            style={{ color: app.accent }}
            onClick={() => navigate(app.pluginId!)}
          >
            <span className="aot-menu-item-icon">{app.icon}</span>
            <span>{app.label.toUpperCase()}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function AotRightPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (e.clientX < window.innerWidth - 4) return;
      const rect = panelRef.current?.getBoundingClientRect();
      if (!rect) return;
      if (e.clientY >= rect.top && e.clientY <= rect.bottom) setIsOpen(true);
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  return (
    <div
      className={`aot-right-wrapper${isOpen ? " is-open" : ""}`}
      onMouseLeave={() => setIsOpen(false)}
    >
      <div className="aot-right-panel" ref={panelRef}>
        <SpeakYourMindInput />
      </div>
    </div>
  );
}

function AlwaysOnTop() {
  return (
    <div className="always-on-top">
      <AotMenu />
      <AotRightPanel />
      <SingleBloomNav />
    </div>
  );
}

export default AlwaysOnTop;
