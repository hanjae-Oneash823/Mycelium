import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

declare global {
  interface Window {
    __splashStart?: number;
  }
}

// Fade out and remove splash screen after minimum 2 seconds
const splash = document.getElementById("splash-screen");
const splashMinDuration = 8200;
const splashStart = window.__splashStart || Date.now();
const splashElapsed = Date.now() - splashStart;
const splashFade = () => {
  if (splash) {
    splash.style.opacity = "0";
    const root = document.getElementById("root");
    if (root) root.classList.add("app-enter");
    setTimeout(() => splash.remove(), 600);
  }
};
if (splashElapsed >= splashMinDuration) {
  splashFade();
} else {
  setTimeout(splashFade, splashMinDuration - splashElapsed);
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
