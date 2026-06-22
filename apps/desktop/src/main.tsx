import React from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import "animal-island-ui/style";
import { Cursor } from "animal-island-ui";
import { App } from "./App";
import { FloatingCard } from "./components/FloatingCard";
import { normalizeResetPasswordHashRoute } from "./lib/routing";
import "./styles.css";

const root = createRoot(document.getElementById("root")!);
const search = new URLSearchParams(window.location.search);
const isFloatingWindow = search.get("window") === "floating";
normalizeResetPasswordHashRoute(window.location, window.history);

root.render(
  <React.StrictMode>
    <Cursor>
      {isFloatingWindow ? (
        <FloatingCard />
      ) : (
        <HashRouter>
          <App />
        </HashRouter>
      )}
    </Cursor>
  </React.StrictMode>
);
