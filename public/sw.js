const CACHE = "ea-academy-static-v1";
const SHELL = ["/", "/app/dashboard", "/offline.html", "/icon.svg"];
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url)))),
  );
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("ea-academy-") && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/")
  )
    return;
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && SHELL.includes(url.pathname)) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(url.pathname, copy));
          }
          return response;
        })
        .catch(
          async () =>
            (await caches.match(url.pathname)) ||
            (url.pathname.startsWith("/app/")
              ? await caches.match("/app/dashboard")
              : null) ||
            (await caches.match("/offline.html")),
        ),
    );
  } else if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/icon.svg"
  ) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
});
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }
  const notification = payload.notification || payload.data || {};
  event.waitUntil(
    self.registration.showNotification(notification.title || "EA Academy", {
      body:
        notification.body ||
        notification.message ||
        "You have a new academy update.",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      vibrate: [200, 100, 200],
      data: {
        url:
          payload.data?.url || payload.data?.actionScreen || "/app/dashboard",
      },
      tag: payload.data?.notificationId || "academy-announcement",
      renotify: true,
    }),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const candidate = new URL(
    event.notification.data?.url || "/app/dashboard",
    self.location.origin,
  );
  const url =
    candidate.origin === self.location.origin
      ? candidate.href
      : self.location.origin + "/app/dashboard";
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async (windows) => {
        const existing = windows.find(
          (w) => new URL(w.url).origin === self.location.origin,
        );
        if (existing) {
          await existing.navigate(url);
          return existing.focus();
        }
        return clients.openWindow(url);
      }),
  );
});
