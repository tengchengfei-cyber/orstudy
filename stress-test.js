/* 压力测试：不依赖任何第三方库，用 Node 内置 http/net 直接打。
   覆盖四类场景：
   1) 高并发 —— 200 个请求同时打
   2) 持续吞吐 —— 并发 30、总量 1000
   3) 慢客户端挂起 —— 开 30 条连接、只发半个请求头、挂 6 秒，验证服务器不死
   4) 全静态资源 —— 五个端点都要 200

   用法：node stress-test.js [端口]
*/
const http = require("http");
const net = require("net");
const HOST = "127.0.0.1";
const PORT = Number(process.argv[2]) || 8123;
const BASE = `http://${HOST}:${PORT}`;

function get(path = "/") {
  return new Promise((resolve) => {
    const req = http.get(BASE + path, (res) => {
      let n = 0;
      res.on("data", (d) => (n += d.length));
      res.on("end", () => resolve({ status: res.statusCode, bytes: n, err: null }));
    });
    req.on("error", (e) => resolve({ status: 0, bytes: 0, err: e.message }));
    req.setTimeout(10000, () => req.destroy(new Error("timeout")));
  });
}

let failures = 0;
function report(name, ok, total, dt) {
  const pct = total ? Math.round((ok / total) * 100) : 0;
  const mark = ok === total ? "✅" : "❌";
  console.log(`  ${mark} ${name.padEnd(26)} ${ok}/${total} (${pct}%)  ${dt}ms`);
  if (ok !== total) failures++;
}

async function main() {
  console.log(`\n压力测试 → ${BASE}\n${"=".repeat(58)}`);

  // 0) 预热：让线程池与磁盘缓存热起来（否则首轮并发会把冷启动误判为失败）
  await Promise.all(Array.from({ length: 20 }, () => get("/")));

  // 1) 高并发
  {
    const N = 200;
    const t0 = Date.now();
    const rs = await Promise.all(Array.from({ length: N }, () => get("/")));
    const dt = Date.now() - t0;
    const ok = rs.filter((r) => r.status === 200).length;
    report("并发 200 请求", ok, N, dt);
  }

  // 2) 持续吞吐
  {
    const TOTAL = 1000, CONC = 30;
    const t0 = Date.now();
    let i = 0, ok = 0;
    async function worker() {
      for (;;) {
        const idx = i++;
        if (idx >= TOTAL) return;
        const r = await get("/");
        if (r.status === 200) ok++;
      }
    }
    await Promise.all(Array.from({ length: CONC }, worker));
    const dt = Date.now() - t0;
    report(`持续 ${TOTAL} 请求(并发${CONC})`, ok, TOTAL, dt);
    const qps = Math.round((TOTAL / dt) * 1000);
    console.log(`       吞吐 ≈ ${qps} req/s`);
  }

  // 3) 慢客户端挂起（复现原始 bug 的场景）
  {
    const SOCKETS = 30;
    const sockets = [];
    for (let k = 0; k < SOCKETS; k++) {
      const s = net.connect(PORT, HOST);
      s.on("error", () => {});
      s.on("connect", () => {
        s.write("GET / HTTP/1.1\r\nHost: x\r\n"); // 故意不写完请求，挂起
        sockets.push(s);
      });
    }
    await new Promise((r) => setTimeout(r, 6000));
    const alive = sockets.filter((s) => !s.destroyed).length;
    const r = await get("/");
    sockets.forEach((s) => s.destroy());
    report("挂起 6 秒后仍响应", r.status === 200 ? 1 : 0, 1, 0);
    console.log(`       挂起连接 ${alive} 条，服务器返回 HTTP ${r.status}`);
  }

  // 4) 全静态资源
  {
    const paths = ["/", "/index.html", "/manifest.json", "/sw.js", "/icon.svg"];
    const rs = await Promise.all(paths.map((p) => get(p)));
    const ok = rs.filter((r) => r.status === 200).length;
    rs.forEach((r, i) => {
      if (r.status !== 200) console.log(`       ⚠ ${paths[i]} → ${r.status} ${r.err || ""}`);
    });
    report("静态资源 5 项", ok, paths.length, 0);
  }

  console.log("=".repeat(58));
  console.log(failures === 0 ? "✅ 压力测试全部通过" : `❌ ${failures} 组失败`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main();
