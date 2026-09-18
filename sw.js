/* Service Worker：网络优先，断网时用缓存回退。
   采用「网络优先」而不是「缓存优先」，避免出现「改了文件但页面不更新」的经典坑。

   ⚠️ 重要约定（v6 起）：导航请求的 respondWith 永远返回一个 Response，
   绝不让 respondWith(undefined) 把「网络抖动」放大成「页面打不开」。 */
const CACHE = "orstudy-v7";
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

  // 页面导航：网络优先 → 缓存回退 → 兜底提示页（永不 undefined）
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((r) => {
          if (!r || !r.ok) throw new Error("bad status " + (r ? r.status : ""));
          const cp = r.clone();
          caches.open(CACHE).then((c) => c.put("./index.html", cp)).catch(() => {});
          return r;
        })
        .catch(() =>
          caches
            .match("./index.html")
            .then((hit) => hit || caches.match("./"))
            .then(
              (hit) =>
                hit ||
                new Response(
                  "网络不可用，且本机没有缓存版本。\n请联网后重新打开（或点浏览器刷新重试）。",
                  { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }
                )
            )
        )
    );
    return;
  }

  // 其他资源：缓存优先，未命中走网络并回填缓存；最终失败才返回 503
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
        .catch(() => new Response("offline", { status: 503 }));
    })
  );
});
