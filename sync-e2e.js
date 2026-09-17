/* 同步后端端到端测试：对着 sync-server.py（8124 端口）打协议。
   用法：先启动后端  python sync-server.py 8124   ，再  node sync-e2e.js */
const BASE = "http://127.0.0.1:8124";
let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = got === want;
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "✅" : "❌"} ${name} → ${JSON.stringify(got)}`);
};

async function main() {
  const room = "e2e-" + Date.now().toString(36);   // 每次运行用唯一房间，避免残留状态
  console.log(`同步后端端到端测试 → ${BASE}  room=${room}\n${"=".repeat(46)}`);

  // 1) GET 空房间
  let r = await fetch(BASE + "/" + room);
  eq("GET 空房间 = {}", await r.text(), "{}");

  // 2) PUT 快照
  const snap = JSON.stringify({
    settings: { semesterStart: "2026-09-07" },
    checkins: { "2026-09-17": ["en-vocab"] },
    extra: {},
    customTasks: {},
    updated: 1789000000000,
  });
  r = await fetch(BASE + "/" + room, { method: "PUT", body: snap });
  eq("PUT → ok", await r.text(), "ok");

  // 3) GET 取回一致
  r = await fetch(BASE + "/" + room);
  eq("GET 取回与快照一致", await r.text(), snap);

  // 4) OPTIONS 预检 + CORS 头
  r = await fetch(BASE + "/" + room, { method: "OPTIONS" });
  eq("OPTIONS 204", r.status, 204);
  eq("CORS Allow-Origin", r.headers.get("access-control-allow-origin"), "*");

  // 5) 路径穿越 / 非法房间号
  r = await fetch(BASE + "/%2e%2e");
  eq("room=.. 拒绝 400", r.status, 400);
  r = await fetch(BASE + "/a%2Fb");
  eq("room 含 / 拒绝 400", r.status, 400);

  // 6) 非 JSON 拒绝
  r = await fetch(BASE + "/" + room + "x", { method: "PUT", body: "not-json{{{" });
  eq("非JSON PUT 400", r.status, 400);

  // 7) 并发 50 次 PUT（单请求失败不影响整体判定）
  const safe = (p) => p.catch(() => ({ status: 0 }));
  const rs = await Promise.all(
    Array.from({ length: 50 }, (_, i) =>
      safe(fetch(BASE + "/load-" + i + "-" + room, { method: "PUT", body: snap }))
    )
  );
  eq("并发 50 PUT 全 200", rs.filter((x) => x.status === 200).length, 50);

  // 8) 并发 PUT 后再 GET 验证数据完整
  r = await fetch(BASE + "/load-49-" + room);
  eq("并发后取回仍完整", await r.text(), snap);

  console.log("=".repeat(46));
  console.log(`  通过 ${pass}，失败 ${fail}`);
  process.exitCode = fail ? 1 : 0;
}
main();
