import React from "react";
import ReactDOM from "react-dom/client";
import ExtensionShell from "../shell/ExtensionShell";
import "@/index.css";

const rootEl = document.getElementById("root");
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <ExtensionShell mode="sidepanel" />
    </React.StrictMode>
  );
}
