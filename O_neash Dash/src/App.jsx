import "./App.css";
import PluginBox from "./plugins/PluginBox.jsx";
import AlwaysOnTop from "./always-visible/AOT-elements.jsx";
import React, { useEffect, useState } from "react";
import { setupDb } from "./lib/db.js";

// No more fade state or displayedPlugin needed!
function AppContent() {
  return (
    <main className="main-container relative" data-tauri-drag-region>
      <AlwaysOnTop />
      <PluginBox />
    </main>
  );
}

function App() {
  const [dbReady, setDbReady] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    // This calls the setupDb function you created
    const initApp = async () => {
      try {
        await setupDb();
        setDbReady(true);
        console.log("Database and Directory Handshake Complete.");
      } catch (err) {
        console.error("Initialization failed:", err);
        setError("Could not initialize the database.");
      }
    };
    initApp();
  }, []);

  // Show a clean loading state while the database initializes
  if (error) return <div className="error-screen">{error}</div>;
  if (!dbReady)
    return <div className="loading-screen">Preparing o_neash...</div>;

  return <AppContent />;
}

export default App;
