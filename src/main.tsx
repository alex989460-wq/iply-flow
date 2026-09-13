import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { supabase } from "@/integrations/supabase/client";
import { installFunctionErrorDetails } from "@/lib/error-message";
import { installTranslateDomGuard } from "@/lib/dom-translate-guard";

// NOTE: Painel theme is applied only inside DashboardLayout (authenticated panel),
// never globally — so the public landing page keeps its original brand identity.

installTranslateDomGuard();
installFunctionErrorDetails(supabase.functions);

createRoot(document.getElementById("root")!).render(<App />);
