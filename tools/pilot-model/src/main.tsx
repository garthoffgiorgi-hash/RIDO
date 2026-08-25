import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import PilotModel from "./PilotModel.tsx";

const root = document.getElementById("root");
if (!root) throw new Error("pilot-model: no #root element in index.html");

createRoot(root).render(
  <StrictMode>
    <PilotModel />
  </StrictMode>,
);
