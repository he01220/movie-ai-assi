import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { AuthProvider } from "./hooks/useAuth";
import { ThemeProvider } from "next-themes";

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
}
if (typeof caches !== 'undefined' && caches.keys) {
  caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
}

let __reloading = false;
const __reloadKey = 'last_reload_ts';
const __scheduleReload = () => {
  if (__reloading) return;
  const now = Date.now();
  const last = Number(sessionStorage.getItem(__reloadKey) || 0);
  if (now - last < 5000) return;
  __reloading = true;
  sessionStorage.setItem(__reloadKey, String(now));
  window.location.reload();
};

window.addEventListener('pageshow', (e) => {
  const nav = (performance && 'getEntriesByType' in performance) ? (performance.getEntriesByType('navigation')[0] as any) : null;
  const isBF = (e as PageTransitionEvent).persisted || (nav && nav.type === 'back_forward');
  if (isBF) __scheduleReload();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') __scheduleReload();
});

window.addEventListener('focus', () => {
  __scheduleReload();
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
