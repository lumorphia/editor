import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Editor } from "@lumorphia/editor-react";
import { standaloneHost } from "./host.ts";
import "./app.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root が無い");
document.documentElement.lang = navigator.languages.some((l) => l.startsWith("en")) ? "en" : "ja";

createRoot(root).render(
  <StrictMode>
    <Editor host={standaloneHost()} />
  </StrictMode>,
);
