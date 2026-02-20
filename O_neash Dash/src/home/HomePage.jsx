import React from "react";
import ClockPlugin from "../plugins/ClockPlugin/ClockPlugin.jsx";

function HomePage() {
  return (
    <div className="home-page">
      <ClockPlugin />
      {/* Add other always-visible plugins here */}
    </div>
  );
}

export default HomePage;
