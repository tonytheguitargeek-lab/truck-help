self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};

  const title = data.title || "TRUCK HELP";

  const options = {
    body: data.body || "New engineering request",
    icon: "./icon-192.png",
    badge: "./icon-192.png",
    data: {
      url: data.url || "./engineer.html"
    }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  event.waitUntil(
    clients.openWindow(
      event.notification.data.url || "./engineer.html"
    )
  );
});
