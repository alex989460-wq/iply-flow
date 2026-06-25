import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { bootstrapTheme } from "./lib/panel-theme";

bootstrapTheme();

createRoot(document.getElementById("root")!).render(<App />);
