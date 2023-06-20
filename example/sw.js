self.addEventListener('install', (e) => {
  console.log('[Service Worker] Install');
  e.waitUntil(self.skipWaiting());
});

self.addEventListener('fetch', (e) => {
  const isTarget =
        e.request.url.startsWith('http') &&
        e.request.url.includes('/check');
  if(!isTarget) {
    e.respondWith(fetch(e.request));
    return;
  }

  e.respondWith(
    fetch(e.request).then((response) => {
      if (response.status === 0) {
        return response;
      }

      // SharedArrayBuffer 用に COEP と COOP を設定する
      const headers = new Headers(response.headers);
      headers.set("Cross-Origin-Embedder-Policy", "require-corp");
      headers.set("Cross-Origin-Opener-Policy", "same-origin");

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    })
  );
});
