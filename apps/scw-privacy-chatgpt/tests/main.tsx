import React from "react"; import { createRoot } from "react-dom/client"; import App from "./app";
import * as E from "./app"; (window as any).E = E;
createRoot(document.getElementById("root")!).render(<App />);
