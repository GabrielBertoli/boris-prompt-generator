import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./atelier.css";
import Root from "./Root.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Root />
  </StrictMode>
);
