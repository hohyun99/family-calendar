// Service Worker — Web Push 수신 + 알림 표시

self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();

  // 탭이 열려있으면 페이지에 메시지 전달 (TTS 실행)
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      for (const client of clients) {
        client.postMessage({ type: 'NOTIFY', ...data });
      }

      // 탭 열림 여부와 무관하게 브라우저 알림 항상 표시
      return self.registration.showNotification(data.title, {
        body: data.body,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: 'family-calendar',
        renotify: true,
        vibrate: [200, 100, 200],
        data: { member: data.member, eventTitle: data.eventTitle },
      });
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(clients => {
      if (clients.length > 0) return clients[0].focus();
      return self.clients.openWindow('/');
    })
  );
});
