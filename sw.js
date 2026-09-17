/* Service Worker：网络优先，断网时用缓存回退。
   采用「网络优先」而不是「缓存优先」，避免出现「改了文件但页面不更新」的经典坑。 */
const CACHE = "orstudy-v4";
const ASSETS = ["./", "./index.html", "./manifest.json", "./icon.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  // 页面导航：网络优先
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((r) => {
          const cp = r.clone();
          caches.open(CACHE).then((c) => c.put("./index.html", cp)).catch(() => {});
          return r;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  // 其他资源：缓存优先，未命中再走网络
  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req)
        .then((r) => {
          if (r && r.status === 200 && r.type === "basic") {
            const cp = r.clone();
            caches.open(CACHE).then((c) => c.put(req, cp)).catch(() => {});
          }
          return r;
        })
        .catch(() => hit);
    })
  );
});
