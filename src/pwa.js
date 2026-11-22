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

// The menu's Refresh button: drop the offline copy (service worker and its
// caches) and reload from the network, so a stuck old version can't linger.
export async function hardRefresh() {
  try {
    const registrations =
      (await navigator.serviceWorker?.getRegistrations()) ?? [];
    await Promise.all(registrations.map((r) => r.unregister()));
  } catch (error) {
    console.warn(error);
  }
  try {
    if (window.caches)
      await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
  } catch (error) {
    console.warn(error);
  }
  const url = new URL(location.href);
  url.searchParams.set("refresh", Date.now().toString(36));
  location.replace(url.toString());
}

// Drop the cache-busting stamp from the address bar once the page has loaded.
{
  const url = new URL(location.href);
  if (url.searchParams.has("refresh")) {
    url.searchParams.delete("refresh");
    history.replaceState(history.state, "", url.toString());
  }
}
