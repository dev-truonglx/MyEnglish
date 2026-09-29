import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { initTheme } from "./services/theme";

// Initialize theme (dark/light/system) before first paint
initTheme();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
