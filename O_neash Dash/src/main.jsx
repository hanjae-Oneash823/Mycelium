import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";


// Fade out and remove splash screen after minimum 2 seconds
const splash = document.getElementById('splash-screen');
const splashMinDuration = 3000;
const splashStart = window.__splashStart || Date.now();
const splashElapsed = Date.now() - splashStart;
const splashFade = () => {
  if (splash) {
    splash.style.opacity = '0';
    setTimeout(() => splash.remove(), 500);
  }
};
if (splashElapsed >= splashMinDuration) {
  splashFade();
} else {
  setTimeout(splashFade, splashMinDuration - splashElapsed);
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
