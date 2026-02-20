import React from "react";
import ClockPlugin from "../plugins/ClockPlugin/ClockPlugin.jsx";
import { LaunchMenu } from "../home/LaunchMenu";

function HomePage() {
  return (
    <div className="home-page">
      <div
        style={{
          position: "absolute",
          top: 0,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 50,
        }}
      >
        <LaunchMenu />
      </div>
      <ClockPlugin />
    </div>
  );
}

export default HomePage;
