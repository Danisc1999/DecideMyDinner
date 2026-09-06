self.addEventListener('push', (event) => {
  let data = { title: 'Decide My Dinner', body: 'Tienes productos por revisar.' };
  try { data = event.data.json(); } catch (e) {}
  event.waitUntil(self.registration.showNotification(data.title, { body: data.body, icon: undefined, badge: undefined }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: 'window' }).then((clients) => {
    if (clients.length > 0) return clients[0].focus();
    return self.clients.openWindow('./');
  }));
});
