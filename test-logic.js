/* 逻辑自测：抽出 index.html 里的纯逻辑部分（渲染之前的全部代码）在 Node 里跑。
   重点验证单双周过滤、周次计算、任务表完整性。 */
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const cut = js.indexOf("/* ============================== 渲染");
if (cut < 0) throw new Error("找不到渲染分界标记");
const logic = js.slice(0, cut);

const stubs = `
var localStorage = { _d:{}, getItem(k){return this._d[k]||null}, setItem(k,v){this._d[k]=v} };
function alert(){} function confirm(){return false}
`;

const tests = `
let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log("  ✅ " + name); }
  else { fail++; console.log("  ❌ " + name + "\\n      得到: " + JSON.stringify(got) + "\\n      期望: " + JSON.stringify(want)); }
};
const D = (s) => parseYmd(s);

console.log("\\n【1】周次与单双周计算（开学第一周周一 = 2026-09-07）");
DB.settings.semesterStart = "2026-09-07";
eq("9/07 是第1周·单周", [weekInfo(D("2026-09-07")).week, weekInfo(D("2026-09-07")).odd], [1, true]);
eq("9/13 仍是第1周·单周", [weekInfo(D("2026-09-13")).week, weekInfo(D("2026-09-13")).odd], [1, true]);
eq("9/14 进入第2周·双周", [weekInfo(D("2026-09-14")).week, weekInfo(D("2026-09-14")).odd], [2, false]);
eq("9/17 是第2周·双周", [weekInfo(D("2026-09-17")).week, weekInfo(D("2026-09-17")).odd], [2, false]);
eq("9/21 进入第3周·单周", [weekInfo(D("2026-09-21")).week, weekInfo(D("2026-09-21")).odd], [3, true]);
eq("开学前不算已开始", weekInfo(D("2026-09-01")).started, false);

console.log("\\n【2】单双周课程过滤（你的课表规则）");
const names = (d, odd) => shownClasses(d, odd).map(c => c.name);
eq("周四·单周 → 无课", names(4, true), []);
eq("周四·双周 → 证券投资学", names(4, false), ["证券投资学"]);
eq("周五·单周 → 只有生物多样性", names(5, true), ["生物多样性与人类（生命健康）"]);
eq("周五·双周 → 运筹学 + 生物多样性", names(5, false), ["运筹学", "生物多样性与人类（生命健康）"]);
eq("周三·单周 → 3 节全上", names(3, true).length, 3);
eq("周三·双周 → 3 节全上", names(3, false).length, 3);
eq("周一 单双周一致", names(1, true).length === names(1, false).length, true);
eq("周二 单双周一致", names(2, true).length === names(2, false).length, true);
eq("周六无课", names(6, true).length + names(6, false).length, 0);
eq("周日无课", names(0, true).length + names(0, false).length, 0);
eq("每天课按节次升序", shownClasses(3, true).every((c,i,a) => i===0 || a[i-1].p < c.p), true);

console.log("\\n【3】每日任务表");
for (let d = 0; d <= 6; d++) {
  const t = tasksFor(d);
  const ids = t.map(x => x.id);
  eq(WEEKNAME[d] + " 任务无重复 id", ids.length, new Set(ids).size);
  eq(WEEKNAME[d] + " 任务数 > 0", t.length > 0, true);
}
eq("每天都有英语词汇", [0,1,2,3,4,5,6].every(d => tasksFor(d).some(t => t.id === "en-vocab")), true);
eq("周日是重型日(4项)", tasksFor(0).length, 4);
eq("周六是重型日(4项)", tasksFor(6).length, 4);
eq("周一只有英语(2项)", tasksFor(1).length, 2);
eq("周三只有英语(2项)", tasksFor(3).length, 2);
eq("周五只有英语(2项)", tasksFor(5).length, 2);
eq("周二含竞赛", tasksFor(2).some(t => t.m === "竞赛"), true);
eq("周四含竞赛", tasksFor(4).some(t => t.m === "竞赛"), true);
eq("周六含工程", tasksFor(6).some(t => t.m === "工程"), true);
eq("周日含工程", tasksFor(0).some(t => t.m === "工程"), true);
eq("所有任务都有 id/m/n/min", [0,1,2,3,4,5,6].every(d => tasksFor(d).every(t => t.id && t.m && t.n && typeof t.min === "number")), true);

console.log("\\n【4】打卡与统计");
DB.checkins = {};
DB.extra = {};
eq("未打卡时今日 0/N", dayStats("2026-09-17").done, 0);
eq("未打卡时不算完成", dayStats("2026-09-17").full, false);
// 2026-09-17 是周四 → 3 项任务
eq("周四任务数为 3", dayStats("2026-09-17").total, 3);
toggle("2026-09-17", "en-vocab");
eq("打完一项 done=1", dayStats("2026-09-17").done, 1);
eq("未打完不算 full", dayStats("2026-09-17").full, false);
toggle("2026-09-17", "en-read");
toggle("2026-09-17", "or-drill");
eq("全打完 full=true", dayStats("2026-09-17").full, true);
eq("累计打卡天数 = 1", totalDays(), 1);
toggle("2026-09-17", "or-drill");
eq("取消一项后 full=false", dayStats("2026-09-17").full, false);
eq("取消后不残留空数组", Array.isArray(DB.checkins["2026-09-17"]) && DB.checkins["2026-09-17"].length, 2);
// 额外任务计入总数
DB.extra["2026-09-17"] = [{ id:"x1", n:"写 README" }];
eq("加额外任务后 total=4", dayStats("2026-09-17").total, 4);
DB.extra["2026-09-17"] = [];

console.log("\\n【5】连续打卡 streak");
DB.checkins = {}; DB.extra = {};
eq("无记录 streak=0", streak(), 0);
toggle("2026-09-17","en-vocab"); toggle("2026-09-17","en-read"); toggle("2026-09-17","or-drill");
eq("仅今天完成 → streak=1", streak(), 1);

console.log("\\n【6】模块累计时长");
DB.checkins = {}; DB.extra = {};
toggle("2026-09-17","en-vocab");   // 英语 15
toggle("2026-09-17","en-read");    // 英语 25
toggle("2026-09-17","or-drill");   // 竞赛 120
const mt = moduleTotals();
eq("英语完成 2 次", mt["英语"].count, 2);
eq("英语累计 40 分钟", mt["英语"].min, 40);
eq("竞赛累计 120 分钟", mt["竞赛"].min, 120);

console.log("\\n【7】倒计时数据完整性");
eq("里程碑都有名称", MILESTONES.every(m => m.n && m.s), true);
eq("已确认日期格式正确", MILESTONES.filter(m=>m.d).every(m => /^\\d{4}-\\d{2}-\\d{2}$/.test(m.d)), true);
eq("竞赛报名截止 = 2026-10-12", MILESTONES[0].d, "2026-10-12");
eq("竞赛初赛 = 2026-11-14", MILESTONES[1].d, "2026-11-14");

console.log("\\n【8】工具函数");
eq("ymd 补零正确", ymd(new Date(2026,8,7)), "2026-09-07");
eq("parseYmd 往返一致", ymd(parseYmd("2026-11-14")), "2026-11-14");
eq("WEEKNAME 7 天齐全", Object.keys(WEEKNAME).length, 7);
eq("PERIODS 5 节齐全", Object.keys(PERIODS).length, 5);
eq("第1节 08:00 开始", PERIODS[1][0], "08:00");
eq("第5节 20:50 结束", PERIODS[5][1], "20:50");

console.log("\\n" + "=".repeat(46));
console.log("  通过 " + pass + " 项，失败 " + fail + " 项");
console.log("=".repeat(46));
if (fail > 0) process.exitCode = 1;
`;

eval(stubs + logic + tests);
