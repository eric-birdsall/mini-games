import { registerSW } from "virtual:pwa-register";

// Set once a new version has downloaded; calling it swaps to that version
// and reloads. The main menu shows an "Update ready" button for it.
export let applyUpdate = null;

if (import.meta.env.MODE === "pages") {
  const updateSW = registerSW({
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
      // Keep this session's assets until the player chooses to update. The
      // waiting worker also activates on its own once all windows close.
      applyUpdate = () => updateSW(true);
      window.dispatchEvent(new Event("pwa-update-ready"));
    },
    onRegisterError(error) {
      console.warn(
        "Offline setup failed; reconnect and reopen Mini Games to retry.",
        error,
      );
    },
  });
}
