/* ============================================================
   同步后端 · Cloudflare Worker 版
   ------------------------------------------------------------
   部署（约 3 分钟）：
   1. 注册 cloudflare.com → Dashboard → Workers & Pages → 创建 Worker
   2. Storage & Databases → KV → 创建命名空间（如 SYNC_NS）
   3. 在 Worker 的 Settings → Bindings 里添加：
      Variable name: SYNC   ·  KV namespace: 你刚建的
   4. 把本文件粘贴进 Worker 编辑器 → Deploy
   5. 记下你的 Worker 地址（形如 https://orstudy-sync.你的账号.workers.dev）
   6. 在站内「统计 → 跨设备同步」填这个地址 + 一个只有你知道的长密钥

   协议：
     GET  /<room>  → 快照 JSON（没有则 {}）
     PUT  /<room>  → 存快照（<512KB），返回 ok
     OPTIONS       → CORS 预检

   隐私说明：room 码就是访问钥匙（无密码体系）。密钥够长够随机，
   就没有人猜得到。不要用生日、学号之类。
   ============================================================ */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    let room = "";
    try { room = decodeURIComponent(url.pathname.slice(1) || ""); } catch (e) { room = ""; }
    if (!room || room.length > 64) {
      return new Response("bad room", { status: 400 });
    }

    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,PUT,OPTIONS",
      "Access-Control-Allow-Headers": "*",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method === "GET") {
      const v = (await env.SYNC.get(room)) || "{}";
      return new Response(v, {
        headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
      });
    }

    if (request.method === "PUT") {
      const body = await request.text();
      if (body.length > 512 * 1024) {
        return new Response("too large", { status: 413, headers: cors });
      }
      await env.SYNC.put(room, body);
      return new Response("ok", { headers: cors });
    }

    return new Response("method not allowed", { status: 405, headers: cors });
  },
};
