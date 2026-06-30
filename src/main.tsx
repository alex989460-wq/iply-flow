import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// NOTE: Painel theme is applied only inside DashboardLayout (authenticated panel),
// never globally — so the public landing page keeps its original brand identity.

createRoot(document.getElementById("root")!).render(<App />);
