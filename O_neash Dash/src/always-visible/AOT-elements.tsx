import { useState, useRef, useEffect } from "react";
import SingleBloomNav from "./SingleBloomNavigator/SingleBloomNav";
import usePluginStore from "../store/usePluginStore";
// import { usePlannerStore } from '../plugins/PlannerPlugin/store/usePlannerStore';
import "./AOT-elements.css";

function AlwaysOnTop() {
  const setActivePlugin = usePluginStore((state) => state.setActivePlugin);
  const activePlugin = usePluginStore((state) => state.activePlugin);

  return (
    <div className="always-on-top">
      {activePlugin !== null && (
        <div
          style={{
            position: "absolute",
            top: 18,
            left: 18,
            zIndex: 1000,
            display: "flex",
            gap: "8px",
            alignItems: "center",
          }}
        >
          <button
            className="always-on-top-home-btn"
            onClick={() => setActivePlugin(null)}
            aria-label="Home"
          >
            go home...
          </button>
          {/* wipe data button removed */}
        </div>
      )}
      <SingleBloomNav />
    </div>
  );
}

export default AlwaysOnTop;
