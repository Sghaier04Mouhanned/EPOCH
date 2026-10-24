// Loaded into the generated service worker (see vite.config.ts). Clicking an
// end-of-phase notification brings Epoch forward, or opens it if it was closed.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (open) return open.focus();
      return self.clients.openWindow(self.registration.scope);
    })(),
  );
});
