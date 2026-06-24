import React from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import "animal-island-ui/style";
import { Cursor } from "animal-island-ui";
import { App } from "./App";
import { FloatingCard } from "./components/FloatingCard";
import { MemoFloatingCard } from "./components/MemoFloatingCard";
import { normalizeResetPasswordHashRoute } from "./lib/routing";
import "./styles.css";

const root = createRoot(document.getElementById("root")!);
const search = new URLSearchParams(window.location.search);
const windowMode = search.get("window");
const memoId = search.get("memoId");
normalizeResetPasswordHashRoute(window.location, window.history);

root.render(
  <React.StrictMode>
    <Cursor>
      {windowMode === "floating" ? (
        <FloatingCard />
      ) : windowMode === "memo" ? (
        <MemoFloatingCard memoId={memoId} />
      ) : (
        <HashRouter>
          <App />
        </HashRouter>
      )}
    </Cursor>
  </React.StrictMode>
);
