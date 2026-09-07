import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import * as Sentry from "@sentry/react";
import "./index.css";

// Unregister stale service workers from previous deployments.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister().then((success) => {
        if (success) {
          console.log("[ServiceWorker] Unregistered stale worker:", registration);
          window.location.reload();
        }
      });
    }
  });
}

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN || "",
  tracesSampleRate: 1.0,
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
