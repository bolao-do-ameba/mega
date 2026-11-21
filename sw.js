self.addEventListener('push', event => {
  let data = { title: '🍀 Bolão Mega-Sena', body: 'Você possui pendências no bolão.', url: './' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (_) {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      data: { url: data.url || './' }
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(clients.openWindow(targetUrl));
});