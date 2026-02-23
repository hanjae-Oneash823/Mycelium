import React from "react";
import ClockPlugin from "../plugins/ClockPlugin/ClockPlugin.jsx";
import { LaunchMenu } from "../home/LaunchMenu";

function HomePage() {
  return (
    <div className="home-page flex flex-col items-center justify-center min-h-screen">
      <ClockPlugin />
      <div className="mt-4">
        <LaunchMenu />
      </div>
    </div>
  );
}

export default HomePage;
