import { registerSW } from "virtual:pwa-register";

if (import.meta.env.MODE === "pages") {
  registerSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const check = () => {
        if (navigator.onLine) registration.update().catch(console.warn);
      };
      window.addEventListener("online", check);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") check();
      });
      setInterval(check, 60 * 60 * 1000);
    },
    onOfflineReady() {
      console.info("Mini Games is ready for offline play.");
    },
    onNeedRefresh() {
      // Keep this session's assets. The waiting worker activates once all
      // controlled windows close; reopening then loads the complete new version.
      console.info(
        "Mini Games update downloaded. Close all game windows and reopen to update.",
      );
    },
    onRegisterError(error) {
      console.warn(
        "Offline setup failed; reconnect and reopen Mini Games to retry.",
        error,
      );
    },
  });
}
