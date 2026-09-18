/* 浏览器级端到端测试（真实 Edge + puppeteer-core）
   ------------------------------------------------------------
   为什么需要它：逻辑测试（test-logic.js）只在 Node 里跑纯函数，
   **结构上抓不到**「点了按钮 → 数据落盘 → 刷新 → 渲染崩溃」这类问题。
   历史上真实发生过的 bug：
     · sanitize() 未初始化 out.customTasks，导致打卡后刷新整页崩（只剩静态框架）
   所以每次改动后，除了 test-logic.js，也要跑这个。

   依赖：puppeteer-core（本机 Edge 当浏览器，不额外下载 Chromium）
     npm i puppeteer-core
   用法：
     node e2e-browser.js [url]        默认 http://127.0.0.1:8123/index.html
   环境变量：
     PUPPETEER_PATH  puppeteer-core 的绝对路径（若不在本目录 node_modules 里）
*/
const EDGE_CANDIDATES = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
];
const fs = require("fs");

function loadPuppeteer() {
  const tries = ["puppeteer-core"];
  if (process.env.PUPPETEER_PATH) tries.push(process.env.PUPPETEER_PATH);
  for (const t of tries) {
    try { return require(t); } catch (e) { /* 继续试 */ }
  }
  console.error("找不到 puppeteer-core。请先： npm i puppeteer-core（或设 PUPPETEER_PATH）");
  process.exit(2);
}

const puppeteer = loadPuppeteer();
const EDGE = EDGE_CANDIDATES.find((p) => fs.existsSync(p));
const URL = process.argv[2] || "http://127.0.0.1:8123/index.html";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log("  ✅ " + name); }
  else { fail++; console.log("  ❌ " + name + (extra ? "  → " + extra : "")); }
};

(async () => {
  if (!EDGE) { console.error("找不到 Edge/Chrome"); process.exit(2); }
  console.log(`浏览器端到端测试 → ${URL}\n${"=".repeat(50)}`);

  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: "new",
    args: ["--no-first-run", "--disable-gpu"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true });

  let errs = [];
  page.on("pageerror", (e) => errs.push("PAGEERROR: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errs.push("CONSOLE: " + m.text()); });
  // alert/confirm 在无头环境会阻塞页面 → 一律自动关掉
  page.on("dialog", (d) => { d.dismiss().catch(() => {}); });
  await page.evaluateOnNewDocument(() => {
    window.alert = () => {};
    window.confirm = () => true;
    window.prompt = () => null;
  });

  const snap = () => page.evaluate(() => ({
    tasks: (document.getElementById("td-tasks") || {}).textContent || "",
    week: (document.getElementById("td-week") || {}).textContent || "",
    progress: (document.getElementById("td-progress-txt") || {}).textContent || "",
    streak: (document.getElementById("k-streak") || {}).textContent || "",
    diag: (document.getElementById("diag-box") || {}).textContent || "",
    charts: (document.getElementById("s-week") || {}).querySelectorAll ? document.getElementById("s-week").querySelectorAll("svg").length : 0,
    bodyLen: document.body ? document.body.innerHTML.length : 0,
  }));
  const reload = async () => { errs = []; await page.reload({ waitUntil: "networkidle2" }); await sleep(1000); };

  // ---------- 1) 干净环境首次打开 ----------
  await page.goto(URL, { waitUntil: "networkidle2" });
  await sleep(600);
  let s = await snap();
  ok("首次打开渲染出任务", s.tasks.includes("词汇"), s.tasks.slice(0, 40));
  ok("首次打开算出周次", /第 \d+ 周/.test(s.week), s.week);
  ok("首次打开无 JS 错误", errs.length === 0, errs.join(" | "));

  // ---------- 2) 打卡 → 刷新（历史 bug 的复现路径） ----------
  await page.evaluate(() => document.querySelector("#td-tasks .task").click());
  await sleep(400);
  s = await snap();
  ok("打卡后进度更新", /1\/\d+ 已完成/.test(s.progress), s.progress);
  await reload();
  s = await snap();
  ok("打卡后刷新仍正常渲染", s.tasks.includes("词汇"), s.tasks.slice(0, 40));
  ok("打卡后刷新保留勾选", s.tasks.includes("✓"), "未见勾选标记");
  ok("打卡后刷新无 JS 错误", errs.length === 0, errs.join(" | "));
  ok("打卡后刷新诊断块有内容", s.diag.includes("页面版本"), s.diag.slice(0, 50));

  // ---------- 3) 一键全打卡 → 刷新 ----------
  await page.evaluate(() => document.getElementById("btn-all").click());
  await sleep(400);
  await reload();
  s = await snap();
  ok("全打卡后刷新正常", s.tasks.includes("词汇") && errs.length === 0, errs.join(" | "));
  ok("全打卡后显示全部完成", s.progress.includes("全部完成"), s.progress);
  await page.evaluate(() => document.getElementById("btn-all").click());  // 复原
  await sleep(300);

  // ---------- 4) 添加额外任务 → 刷新 ----------
  await page.evaluate(() => {
    document.getElementById("extra-in").value = "端到端测试任务";
    document.getElementById("extra-add").click();
  });
  await sleep(400);
  await reload();
  s = await snap();
  ok("额外任务刷新后仍在", s.tasks.includes("端到端测试任务") && errs.length === 0, errs.join(" | "));

  // ---------- 5) 改开学日期 → 刷新 ----------
  await page.evaluate(() => {
    document.getElementById("set-start").value = "2026-09-14";
    document.getElementById("set-save").click();
  });
  await sleep(400);
  await reload();
  s = await snap();
  ok("改日期后刷新正常", /第 -?\d+ 周/.test(s.week) && errs.length === 0, errs.join(" | "));

  // ---------- 6) 写同步配置（不真连网）→ 刷新 ----------
  await page.evaluate(() => {
    localStorage.setItem("orstudy.sync.v1", JSON.stringify({
      mode: "github", token: "github_pat_dummy", owner: "x", repo: "y",
      path: "sync/snapshot.json", last: 0, status: "未配置"
    }));
  });
  await reload();
  s = await snap();
  ok("配了同步后刷新正常", s.tasks.includes("词汇") && errs.length === 0, errs.join(" | "));

  // ---------- 7) 统计页图表 ----------
  await page.evaluate(() => document.querySelector('.nav button[data-v="stats"]').click());
  await sleep(600);
  s = await snap();
  ok("周报表渲染出 SVG 图表", s.charts >= 2, "svg 数量=" + s.charts);
  ok("统计页无 JS 错误", errs.length === 0, errs.join(" | "));

  // ---------- 8) 手工注入「带 customTasks 的老数据」→ 刷新（历史 bug 的精确复现） ----------
  await page.evaluate(() => {
    const todayIdx = String(new Date().getDay());   // 注入到「今天」这一列，才好在今日页看到
    localStorage.setItem("orstudy.v1", JSON.stringify({
      settings: { semesterStart: "2026-09-07" },
      checkins: {},
      extra: {},
      customTasks: { [todayIdx]: [{ id: "c1", m: "其他", n: "老数据任务", d: "", min: 10 }] },
      updated: 1789000000000,
      taskSchema: 1
    }));
  });
  await reload();
  s = await snap();
  ok("加载带 customTasks 的老数据不崩", s.tasks.length > 0 && errs.length === 0, errs.join(" | "));
  ok("老数据的自定义任务被保留", s.tasks.includes("老数据任务"), s.tasks.slice(0, 60));

  console.log("=".repeat(50));
  console.log(`  通过 ${pass}，失败 ${fail}`);
  await browser.close();
  process.exitCode = fail ? 1 : 0;
})();
