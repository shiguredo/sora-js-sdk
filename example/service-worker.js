self.addEventListener('install', (e) => {
  console.log('[Service Worker] Install');
  e.waitUntil(self.skipWaiting());
});

self.addEventListener('fetch', (e) => {
  const isTarget =
        e.request.url.startsWith('http') &&
        (e.request.url.includes('recording') ||
         e.request.url.includes('sendrecv') ||
         e.request.url.includes('sendonly') ||
         e.request.url.includes('lyra-benchmark') ||
         e.request.url.includes('lyra_async_worker.js')) ;
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

      // TODO: web worker 用の一時的な対処。後でもう少し整理する
      headers.set("Cross-Origin-Resource-Policy", "cross-origin");

      // Chrome でローカルの http で実行する場合に必要
        //headers.set("Content-Security-Policy", "treat-as-public-address");

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    })
  );
});
