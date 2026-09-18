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
var renderAll = function(){};
var document = {
  querySelector(){ return null },          // 渲染层不参与逻辑测试
  querySelectorAll(){ return [] },
  getElementById(){ return null },
  createElement(){ return {} }
};
var location = { search:"", pathname:"/", protocol:"http:", origin:"http://localhost", replace(){} };
var navigator = { onLine:true };
var window = { isSecureContext:true, innerWidth:390, innerHeight:844, caches:null, matchMedia(){return {matches:false}} };
`;

const tests = `
let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log("  ✅ " + name); }
  else { fail++; console.log("  ❌ " + name + "\\n      得到: " + JSON.stringify(got) + "\\n      期望: " + JSON.stringify(want)); }
};
const D = (s) => parseYmd(s);
/* ⚠️ 默认任务表必须深拷贝，且每一「天」的数组也要独立：
   ensureCustomTasks 迁移时会写回 customTasks[d]，若与 DEFAULT_TASKS[d] 共用同一个
   数组对象，就会把内置默认本身改脏（连带让「等于 v3 默认」这类判定永远失效）。 */
const cloneDefaults = () => {
  const o = {};
  [0,1,2,3,4,5,6].forEach(d => { o[d] = JSON.parse(JSON.stringify(DEFAULT_TASKS[d])); });
  return o;
};

console.log("\\n【1】周次与单双周计算（开学第一周周一 = 2026-09-07）");
DB.settings.semesterStart = "2026-09-07";
eq("9/07 是第1周·单周", [weekInfo(D("2026-09-07")).week, weekInfo(D("2026-09-07")).odd], [1, true]);
eq("9/13 仍是第1周·单周", [weekInfo(D("2026-09-13")).week, weekInfo(D("2026-09-13")).odd], [1, true]);
eq("9/14 进入第2周·双周", [weekInfo(D("2026-09-14")).week, weekInfo(D("2026-09-14")).odd], [2, false]);
eq("9/17 是第2周·双周", [weekInfo(D("2026-09-17")).week, weekInfo(D("2026-09-17")).odd], [2, false]);
eq("9/21 进入第3周·单周", [weekInfo(D("2026-09-21")).week, weekInfo(D("2026-09-21")).odd], [3, true]);
eq("开学前不算已开始", weekInfo(D("2026-09-01")).started, false);
// 真实校历：第 1 周周一 = 2026-08-31
DB.settings.semesterStart = "2026-08-31";
eq("校历 8/31 第1周·单周", [weekInfo(D("2026-08-31")).week, weekInfo(D("2026-08-31")).odd], [1, true]);
eq("校历 9/07 第2周·双周", [weekInfo(D("2026-09-07")).week, weekInfo(D("2026-09-07")).odd], [2, false]);
eq("校历 9/14 第3周·单周", [weekInfo(D("2026-09-14")).week, weekInfo(D("2026-09-14")).odd], [3, true]);
eq("校历 9/17 第3周·单周", [weekInfo(D("2026-09-17")).week, weekInfo(D("2026-09-17")).odd], [3, true]);
DB.settings.semesterStart = "2026-09-07";   // 还原，供后续用例

console.log("\\n【2】单双周课程过滤（你的课表规则）");
const names = (d, odd) => shownClasses(d, odd).map(c => c.name);
eq("周四·单周 → 无课", names(4, true), []);
eq("周四·双周 → 证券投资学", names(4, false), ["证券投资学"]);
eq("周三·单周 → 2 节（无早八）", names(3, true), ["运筹学", "随机过程基础"]);
eq("周三·双周 → 3 节（含早八数理统计）", names(3, false), ["数理统计", "运筹学", "随机过程基础"]);
eq("周五·单周 → 运筹学 + 生物多样性", names(5, true), ["运筹学", "生物多样性与人类（生命健康）"]);
eq("周五·双周 → 运筹学 + 生物多样性", names(5, false), ["运筹学", "生物多样性与人类（生命健康）"]);
eq("运筹学单双周都有(周三&周五)", [true,false].every(o => names(3,o).includes("运筹学") && names(5,o).includes("运筹学")), true);
eq("周一 单双周一致", names(1, true).length === names(1, false).length, true);
eq("周二 单双周一致", names(2, true).length === names(2, false).length, true);
eq("周六无课", names(6, true).length + names(6, false).length, 0);
eq("周日无课", names(0, true).length + names(0, false).length, 0);
eq("每天课按节次升序", shownClasses(3, false).every((c,i,a) => i===0 || a[i-1].p < c.p), true);

console.log("\\n【3】每日任务表");
for (let d = 0; d <= 6; d++) {
  const t = tasksFor(d);
  const ids = t.map(x => x.id);
  eq(WEEKNAME[d] + " 任务无重复 id", ids.length, new Set(ids).size);
  eq(WEEKNAME[d] + " 任务数 > 0", t.length > 0, true);
}
eq("每天都有英语词汇", [0,1,2,3,4,5,6].every(d => tasksFor(d).some(t => t.id === "en-vocab")), true);
eq("周日是重型日(4项)", tasksFor(0).length, 4);
eq("周一含英语+数学+健身(4项)", tasksFor(1).length, 4);
eq("周一含竞赛", tasksFor(1).some(t=>t.m==="竞赛"), true);
eq("周三含英语+数学+健身(4项)", tasksFor(3).length, 4);
eq("周三含竞赛", tasksFor(3).some(t=>t.m==="竞赛"), true);
eq("周五含英语+数学+健身(4项)", tasksFor(5).length, 4);
eq("周五含竞赛", tasksFor(5).some(t=>t.m==="竞赛"), true);
eq("每个工作日都有数学", [1,2,3,4,5].every(d => tasksFor(d).some(t => t.m === "竞赛")), true);
eq("周二含竞赛", tasksFor(2).some(t => t.m === "竞赛"), true);
eq("周四含竞赛", tasksFor(4).some(t => t.m === "竞赛"), true);
eq("周六含工程", tasksFor(6).some(t => t.m === "工程"), true);
eq("周日含工程", tasksFor(0).some(t => t.m === "工程"), true);
// v1.7：健身任务（周一至周六各一条，周日休息）
eq("周一至周六都有健身任务", [1,2,3,4,5,6].every(d => tasksFor(d).some(t => t.m === "健身")), true);
eq("周日（休息日）无健身任务", tasksFor(0).some(t => t.m === "健身"), false);
eq("健身任务只有一条/天", [1,2,3,4,5,6].every(d => tasksFor(d).filter(t => t.m === "健身").length === 1), true);
eq("周一/周四同为推日", [tasksFor(1), tasksFor(4)].every(l => l.some(t => t.id === "gym-push")), true);
eq("周二/周五同为拉日", [tasksFor(2), tasksFor(5)].every(l => l.some(t => t.id === "gym-pull")), true);
eq("周三/周六同为腿日", [tasksFor(3), tasksFor(6)].every(l => l.some(t => t.id === "gym-legs")), true);
eq("健身任务时长合理(30–120)", [1,2,3,4,5,6].every(d => {
  const g = tasksFor(d).find(t => t.m === "健身");
  return g.min >= 30 && g.min <= 120;
}), true);
eq("所有任务都有 id/m/n/min", [0,1,2,3,4,5,6].every(d => tasksFor(d).every(t => t.id && t.m && t.n && typeof t.min === "number")), true);

console.log("\\n【4】打卡与统计");
DB.checkins = {};
DB.extra = {};
// 2026-09-17 是周四 → 任务条数从任务表实时取（避免写死数字，任务表变动时测试仍有效）
const thuIds = tasksFor(4).map(t => t.id);
eq("未打卡时今日 0/N", dayStats("2026-09-17").done, 0);
eq("未打卡时不算完成", dayStats("2026-09-17").full, false);
eq("周四任务数为任务表条数", dayStats("2026-09-17").total, thuIds.length);
toggle("2026-09-17", "en-vocab");
eq("打完一项 done=1", dayStats("2026-09-17").done, 1);
eq("未打完不算 full", dayStats("2026-09-17").full, false);
thuIds.filter(id => id !== "en-vocab").forEach(id => toggle("2026-09-17", id));
eq("全打完 full=true", dayStats("2026-09-17").full, true);
eq("累计打卡天数 = 1", totalDays(), 1);
toggle("2026-09-17", "or-drill");
eq("取消一项后 full=false", dayStats("2026-09-17").full, false);
eq("取消后不残留空数组", Array.isArray(DB.checkins["2026-09-17"]) && DB.checkins["2026-09-17"].length, thuIds.length - 1);
// 额外任务计入总数
DB.extra["2026-09-17"] = [{ id:"x1", n:"写 README" }];
eq("加额外任务后 total 增 1", dayStats("2026-09-17").total, thuIds.length + 1);
DB.extra["2026-09-17"] = [];

console.log("\\n【5】连续打卡 streak");
DB.checkins = {}; DB.extra = {};
eq("无记录 streak=0", streak(), 0);
thuIds.forEach(id => toggle("2026-09-17", id));
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

console.log("\\n【9】数据健壮性（sanitize / loadDB / save）");
eq("sanitize(null) 得到空库", Object.keys(sanitize(null).checkins).length, 0);
eq("sanitize 过滤坏 checkins 类型", Object.keys(sanitize({checkins:"bad"}).checkins).length, 0);
eq("sanitize 过滤非字符串任务id", sanitize({checkins:{"2026-09-17":["a",123,null]}}).checkins["2026-09-17"].length, 1);
eq("sanitize 过滤坏 extra 条目", sanitize({extra:{"2026-09-17":[{id:"x",n:"y"},{bad:1},null]}}).extra["2026-09-17"].length, 1);
eq("sanitize 保留 settings", sanitize({settings:{semesterStart:"2026-09-01"}}).settings.semesterStart, "2026-09-01");

// 主存储损坏 → 回退备份
localStorage._d = {
  "orstudy.v1": "{损坏的JSON",
  "orstudy.v1.backup": JSON.stringify({checkins:{"2026-09-16":["en-vocab"]},extra:{},settings:{semesterStart:"2026-09-07"}})
};
DB = ensureCustomTasks(loadDB());
eq("主存储损坏时从备份恢复", DB.checkins["2026-09-16"] && DB.checkins["2026-09-16"].length, 1);

// 主存储正常时不用备份
localStorage._d = {
  "orstudy.v1": JSON.stringify({checkins:{"2026-09-15":["en-read"]},extra:{},settings:{semesterStart:"2026-09-07"}}),
  "orstudy.v1.backup": JSON.stringify({checkins:{"2026-09-14":["en-vocab"]},extra:{},settings:{}})
};
DB = ensureCustomTasks(loadDB());
eq("主存储正常时优先主存储", Object.keys(DB.checkins)[0], "2026-09-15");

// save 写两个 key
DB = ensureCustomTasks(DEF()); DB.checkins["2026-09-17"] = ["en-vocab"];
save();
eq("save 写主存储", JSON.parse(localStorage._d["orstudy.v1"]).checkins["2026-09-17"].length, 1);
eq("save 写恢复备份", JSON.parse(localStorage._d["orstudy.v1.backup"]).checkins["2026-09-17"].length, 1);

// ⚠️ 历史 bug 回归（v1.6 修复）：sanitize 未初始化 out.customTasks，
//    导致「打卡后刷新」整页崩（Cannot set properties of undefined）。逻辑测试必须守住这条。
{
  let e1 = null;
  try { sanitize({ customTasks: { "1": [{ id: "a", m: "其他", n: "x", d: "", min: 5 }] } }); }
  catch (e) { e1 = e.message; }
  eq("sanitize 能处理带 customTasks 的数据", e1, null);
  eq("sanitize 保留 customTasks 内容",
     sanitize({ customTasks: { "1": [{ id: "a", m: "其他", n: "x", d: "", min: 5 }] } }).customTasks["1"].length, 1);
  eq("sanitize 无 customTasks 时也返回对象", typeof sanitize({}).customTasks, "object");
  eq("sanitize 恒返回 checkins/extra 对象",
     [typeof sanitize({}).checkins, typeof sanitize({}).extra].join(","), "object,object");

  // 完整往返：save → loadDB → sanitize（真实的崩溃路径）
  DB = ensureCustomTasks(DEF());
  DB.checkins["2026-09-17"] = ["en-vocab"];
  save();
  let e2 = null;
  try { DB = ensureCustomTasks(sanitize(JSON.parse(localStorage.getItem("orstudy.v1")))); }
  catch (e) { e2 = e.message; }
  eq("存储往返(save→读回→sanitize)不抛错", e2, null);
  eq("往返后 customTasks 完好", Array.isArray(DB.customTasks[1]), true);
  eq("往返后打卡数据完好", DB.checkins["2026-09-17"].length, 1);
}

// ⚠️ 历史 bug 回归（v1.6 修复）：loadDB 的「空数据」判定只看 checkins/extra，
//    导致「只自定义了任务、还没打卡」的数据被误判为空，进而被恢复备份覆盖。
{
  const mk = (o) => JSON.stringify(Object.assign(
    { settings: { semesterStart: "2026-09-07" }, checkins: {}, extra: {}, customTasks: {}, updated: 0 }, o));

  localStorage._d = {
    "orstudy.v1": mk({ customTasks: { "1": [{ id: "c1", m: "其他", n: "自定义", d: "", min: 5 }] }, updated: 123 }),
    "orstudy.v1.backup": mk({ checkins: { "2026-09-17": ["en-vocab"] }, updated: 99 }),
  };
  DB = ensureCustomTasks(loadDB());
  eq("只自定义任务(未打卡)时优先主存储", DB.customTasks[1][0].id, "c1");
  eq("不被备份里的打卡覆盖", Object.keys(DB.checkins).length, 0);

  localStorage._d = {
    "orstudy.v1": mk({ settings: {} }),
    "orstudy.v1.backup": mk({ checkins: { "2026-09-17": ["en-vocab"] }, updated: 99 }),
  };
  DB = ensureCustomTasks(loadDB());
  eq("主存储确实为空时才回退备份", Object.keys(DB.checkins).length, 1);

  localStorage._d = {
    "orstudy.v1": "{ 坏掉的 JSON",
    "orstudy.v1.backup": mk({ checkins: { "2026-09-16": ["en-vocab"] }, updated: 5 }),
  };
  DB = ensureCustomTasks(loadDB());
  eq("主存储损坏时回退备份", Object.keys(DB.checkins)[0], "2026-09-16");
}

console.log("\\n【10】一键全打卡（dayTaskIds / setDayAll）");
DB.checkins = {}; DB.extra = {};
const thuLen = tasksFor(4).length;
eq("周四 dayTaskIds = 任务表条数", dayTaskIds("2026-09-17").length, thuLen);
setDayAll("2026-09-17");
eq("全打卡后 full=true", dayStats("2026-09-17").full, true);
eq("全打卡后 done=全部", dayStats("2026-09-17").done, thuLen);
setDayAll("2026-09-17");
eq("再按一次全取消", dayStats("2026-09-17").done, 0);
eq("取消后不残留键", ("2026-09-17" in DB.checkins), false);
// 含额外任务
DB.extra["2026-09-17"] = [{id:"x1",n:"写 README"}];
setDayAll("2026-09-17");
eq("额外任务也一起打卡", dayStats("2026-09-17").done, thuLen + 1);
setDayAll("2026-09-17");
eq("再次全取消(含额外)", dayStats("2026-09-17").done, 0);
DB.extra = {};

console.log("\\n【11】课表上周/下周的奇偶推导");
DB.settings.semesterStart = "2026-09-07";
// 2026-09-17 是第 2 周（双周）。offset +1 → 第 3 周（单周）
const w2 = weekInfo(D("2026-09-17"));
eq("本周=2", w2.week, 2);
eq("offset+1 → 第3周·单周", (w2.week+1)%2===1, true);
eq("offset-1 → 第1周·单周", (w2.week-1)%2===1, true);
eq("下周(单周)·周四无课", shownClasses(4, (w2.week+1)%2===1).length, 0);
eq("单周·周三无早八数理统计", shownClasses(3, true).some(c=>c.name==="数理统计"), false);
eq("双周·周三有早八数理统计", shownClasses(3, false).some(c=>c.name==="数理统计"), true);
eq("单周·周五仍有运筹学(每周都有)", shownClasses(5, true).some(c=>c.name==="运筹学"), true);
eq("双周·周五也有运筹学", shownClasses(5, false).some(c=>c.name==="运筹学"), true);

console.log("\\n【12】自定义任务（v1.2）");
// 初始状态：ensureCustomTasks 已在加载时用默认值播种
eq("周一默认条数 = 内置", tasksFor(1).length, DEFAULT_TASKS[1].length);
eq("周六默认条数 = 内置", tasksFor(6).length, DEFAULT_TASKS[6].length);
// 添加
DB.customTasks[1].push({id:"c1",m:"其他",n:"每日复盘",d:"写三行总结",min:15});
eq("添加后周一 多一项", tasksFor(1).length, DEFAULT_TASKS[1].length + 1);
eq("新任务可被取到", tasksFor(1).some(t=>t.id==="c1"), true);
// 删除
DB.customTasks[1] = DB.customTasks[1].filter(t=>t.id!=="c1");
eq("删除后周一恢复", tasksFor(1).length, DEFAULT_TASKS[1].length);
// 恢复默认
DB.customTasks[1] = [{id:"x",m:"其他",n:"t",d:"",min:10}];
DB.customTasks[1] = JSON.parse(JSON.stringify(DEFAULT_TASKS[1]));
eq("恢复默认与内置一致", JSON.stringify(tasksFor(1)), JSON.stringify(DEFAULT_TASKS[1]));
// 部分缺失时补全、已有保留
DB.customTasks = {1:[{id:"x",m:"其他",n:"t",d:"",min:10}]};
ensureCustomTasks(DB);
eq("缺失的天自动补默认(周日4项)", tasksFor(0).length, 4);
eq("已有的天保留(周一1项)", tasksFor(1).length, 1);
eq("补齐后每天都有任务", [0,1,2,3,4,5,6].every(d=>tasksFor(d).length>0), true);
// 孤儿打卡：删除任务后，历史打卡不再计入统计
DB.checkins = {}; DB.extra = {};
DB.customTasks = cloneDefaults();
DB.customTasks[3] = [{id:"keep",m:"英语",n:"仅此一项",d:"",min:10}];  // 9/16 是周三
DB.checkins["2026-09-16"] = ["en-vocab","en-listen"];  // 这两个 id 已不存在于周三
eq("孤儿打卡不计入 done", dayStats("2026-09-16").done, 0);
eq("total 按当前任务表算", dayStats("2026-09-16").total, 1);
eq("孤儿打卡不算 full", dayStats("2026-09-16").full, false);
DB.checkins["2026-09-16"] = ["keep"];
eq("真实任务打卡计入", dayStats("2026-09-16").done, 1);
eq("唯一任务打卡即 full", dayStats("2026-09-16").full, true);
// 清理状态
DB.checkins = {}; DB.extra = {};
DB.customTasks = cloneDefaults();

console.log("\\n【13】周视图报表（weekStats）");
DB.checkins = {}; DB.extra = {};
DB.customTasks = cloneDefaults();
let ws = weekStats(4);
eq("返回 4 周", ws.length, 4);
eq("无打卡时本周 rate=0", ws[3].rate, 0);
eq("每项都有 label/days", ws.every(w=>w.label && typeof w.days==="number"), true);
eq("周数按时间升序且末尾是本周", ws[3].days >= 1, true);
const tds = ymd(new Date());
setDayAll(tds);
ws = weekStats(4);
const expRate = Math.round(100 / ws[3].withTasks);   // 周完成率按整周口径：只打卡今天 = 1/本周已过天数
eq("今天全打卡后本周 rate 正确", ws[3].rate, expRate);
eq("本周 full 天数 = 1", ws[3].full, 1);
eq("上周无打卡 rate=0", ws[2].rate, 0);
setDayAll(tds);            // 取消，还原
ws = weekStats(1);
eq("取消后 rate=0", ws[0].rate, 0);
toggle(tds, "en-vocab");   // 英语 15 分钟
ws = weekStats(1);
eq("英语词汇 15 分钟进本周桶", ws[0].mins["英语"], 15);
eq("其他模块为 0", ws[0].mins["竞赛"]||0, 0);
// 上周的数据进上周的桶
const lastMon = new Date(); lastMon.setDate(lastMon.getDate() - ((new Date().getDay()+6)%7) - 7);
DB.checkins[ymd(lastMon)] = ["en-vocab","en-listen"];   // 周一：词汇15+听力25=40
ws = weekStats(2);
eq("上周英语 40 分钟", ws[0].mins["英语"], 40);
eq("本周只有 15 分钟", ws[1].mins["英语"], 15);
DB.checkins = {}; DB.extra = {};

console.log("\\n【14】同步 LWW 决策（syncDecide / updated）");
eq("远端新 → 拉取(-1)", syncDecide(100, 200), -1);
eq("本地新 → 推送(1)", syncDecide(200, 100), 1);
eq("相等 → 不动(0)", syncDecide(150, 150), 0);
eq("都为 0 → 不动", syncDecide(0, 0), 0);
eq("远端 0 本地有值 → 推送", syncDecide(50, 0), 1);
eq("本地缺 远端有值 → 拉取", syncDecide(undefined, 9), -1);
eq("非法值按 0 处理", syncDecide("abc", null), 0);
DB = ensureCustomTasks(DEF());
DB.updated = 0;
const t0 = Date.now();
save();
eq("save 后 updated 被更新", DB.updated >= t0, true);
eq("sanitize 保留 updated", sanitize({updated: 123456}).updated, 123456);
eq("sanitize 非法 updated 归 0", sanitize({updated: "x"}).updated, 0);

console.log("\\n【15】任务迁移（周一三五加数学 + 加健身，保护自定义）");
// 模拟老用户：customTasks 还是 v1 默认 + taskSchema 缺失
const v1Tasks = cloneDefaults();
v1Tasks[1] = v1Tasks[1].filter(t => t.id !== "or-calc");      // 周一退回 v1（2 项）
v1Tasks[3] = v1Tasks[3].filter(t => t.id !== "or-drill");     // 周三退回 v1
v1Tasks[5] = v1Tasks[5].filter(t => t.id !== "or-algebra2");  // 周五退回 v1
DB = ensureCustomTasks(DEF());
DB.customTasks = v1Tasks;
delete DB.taskSchema;
ensureCustomTasks(DB);
eq("未改过的周一被迁移到 3 项", DB.customTasks[1].length, 3);
eq("未改过的周三被迁移到 3 项", DB.customTasks[3].length, 3);
eq("未改过的周五被迁移到 3 项", DB.customTasks[5].length, 3);
eq("taskSchema 升到最新", DB.taskSchema, TASK_SCHEMA);
// 用户自定义过的天不受迁移影响
DB.customTasks = cloneDefaults();
DB.customTasks[2] = [{id:"my",m:"其他",n:"我的自定义",d:"",min:10}];
DB.taskSchema = 1;
ensureCustomTasks(DB);
eq("自定义过的周二保持不变", DB.customTasks[2].length, 1);
eq("自定义天的 id 不变", DB.customTasks[2][0].id, "my");
// 已是最新 schema 时不再迁移
DB.customTasks = cloneDefaults();
DB.customTasks[1] = DB.customTasks[1].filter(t=>t.id!=="or-calc");
DB.taskSchema = TASK_SCHEMA;
ensureCustomTasks(DB);
eq("schema 已最新时不再迁移(尊重用户删除)", DB.customTasks[1].length, DEFAULT_TASKS[1].length-1);

console.log("\\n【15a】v3 → v4 健身任务迁移（补齐且绝不动用户的选择）");
const V3 = d => DEFAULT_TASKS[d].filter(t => t.m !== "健身");
// (0) v1 老数据 + 某天自定义过 → 那一天整体不动
DB = ensureCustomTasks(DEF());
DB.customTasks = cloneDefaults();
DB.customTasks[2] = [{id:"my",m:"其他",n:"我的自定义",d:"",min:10}];
delete DB.taskSchema;
DB.gymSkipped = {};
ensureCustomTasks(DB);
eq("自定义过的天迁移后仍只有 1 项", DB.customTasks[2].length, 1);
eq("自定义天没被塞进健身任务", DB.customTasks[2].some(t => t.m === "健身"), false);
eq("同一次迁移里其他天补上了健身", DB.customTasks[4].some(t => t.m === "健身"), true);
// (1) v3 数据里的默认天（还没有健身任务）→ 迁移按默认补齐
DB = ensureCustomTasks(DEF());
DB.customTasks = cloneDefaults();
DB.customTasks[3] = V3(3);
DB.taskSchema = 3;
DB.gymSkipped = {};
ensureCustomTasks(DB);
eq("v3 默认天被补齐健身任务", DB.customTasks[3].some(t => t.m === "健身"), true);
eq("补齐后与内置默认一致(周三)", JSON.stringify(DB.customTasks[3]), JSON.stringify(DEFAULT_TASKS[3]));
eq("补齐后不重复", DB.customTasks[3].filter(t => t.m === "健身").length, 1);
eq("同一天其他任务不受影响", DB.customTasks[3].some(t => t.id === "or-drill"), true);
// (2) v3 数据里从来没排过健身 → 迁移补上
DB = ensureCustomTasks(DEF());
DB.customTasks = cloneDefaults();
DB.customTasks[1] = V3(1);
DB.customTasks[4] = V3(4);
DB.taskSchema = 3;
DB.gymSkipped = {};
ensureCustomTasks(DB);
eq("缺失的健身任务被补回(周一)", DB.customTasks[1].some(t => t.m === "健身"), true);
eq("缺失的健身任务被补回(周四)", DB.customTasks[4].some(t => t.m === "健身"), true);
eq("补回后不重复", DB.customTasks[1].filter(t => t.m === "健身").length, 1);
eq("周日休息日不补健身", DB.customTasks[0].some(t => t.m === "健身"), false);
eq("补回后与内置默认一致", JSON.stringify(DB.customTasks[1]), JSON.stringify(DEFAULT_TASKS[1]));
// (3) 用户在前端明确删过健身（gymSkipped）→ 升级不再塞回
DB = ensureCustomTasks(DEF());
DB.customTasks = cloneDefaults();
DB.customTasks[3] = V3(3);
DB.taskSchema = 3;
DB.gymSkipped = {3:true};
ensureCustomTasks(DB);
eq("明确删过的健身任务不被塞回", DB.customTasks[3].some(t => t.m === "健身"), false);
eq("该天其他缺失项仍按默认补齐", DB.customTasks[3].length, V3(3).length);
// 恢复默认后应能重新拿回健身任务
delete DB.gymSkipped[3];
DB.customTasks[3] = V3(3);
DB.taskSchema = 3;
ensureCustomTasks(DB);
eq("恢复默认后健身任务回来", DB.customTasks[3].some(t => t.m === "健身"), true);
// (4) 迁移是幂等的
const before = JSON.stringify(DB.customTasks);
DB.taskSchema = 3;
ensureCustomTasks(DB);
eq("迁移幂等（重复跑不改动）", JSON.stringify(DB.customTasks), before);

console.log("\\n【15b】校历迁移（旧推测默认值 → 真实开学日 2026-08-31）");
eq("默认开学日已是 8/31", DEF().settings.semesterStart, "2026-08-31");
DB = ensureCustomTasks(DEF());
DB.settings.semesterStart = "2026-09-07";   // 模拟旧默认值
DB.taskSchema = 2;
ensureCustomTasks(DB);
eq("旧默认日期被纠正为 8/31", DB.settings.semesterStart, "2026-08-31");
// 用户自己设过的日期不被覆盖
DB.settings.semesterStart = "2026-09-14";
DB.taskSchema = 2;
ensureCustomTasks(DB);
eq("用户自定义的日期不被覆盖", DB.settings.semesterStart, "2026-09-14");

console.log("\\n【16】GitHub 同步（base64 与协议解析）");
eq("b64 中文往返", b64decode(b64encode("优化方向·数分专题《裴礼文》")), "优化方向·数分专题《裴礼文》");
eq("b64 含 emoji 往返", b64decode(b64encode("🎉 打卡")), "🎉 打卡");
eq("b64 长 JSON 往返", b64decode(b64encode(JSON.stringify(DB))).slice(0,1), "{");
// GitHub GET 响应解析（模拟 Contents API 返回）
const fakeGh = {content: b64encode(JSON.stringify({checkins:{},extra:{},updated:777})), sha:"abc123"};
const parsed = JSON.parse(b64decode(fakeGh.content));
eq("解析快照 updated", parsed.updated, 777);
eq("解析快照 sha 由响应给出", fakeGh.sha, "abc123");
eq("SYNC 默认 github 字段齐全", ["mode","token","owner","repo","path"].every(k=>k in SYNC), true);

console.log("\\n【17】健身计划（三分化）");
eq("计划名与目标齐全", !!(gymPlan().name && gymPlan().goal), true);
eq("三套分化：推/拉/腿", gymRoutines().map(r => r.name).join(","), "推,拉,腿");
eq("每套都有动作", gymRoutines().every(r => r.ex.length >= 5), true);
eq("每周 6 练（只休周日）", gymPlan().days.filter(i => i >= 0).length, 6);
eq("周日为休息日", gymPlan().days[0], -1);
eq("训练日下标合法", gymPlan().days.every(i => i === -1 || (i >= 0 && i < gymRoutines().length)), true);
eq("每套动作名不重复", gymRoutines().every(r => new Set(r.ex.map(e => e.n)).size === r.ex.length), true);
eq("每个动作组数 1–10", gymRoutines().every(r => r.ex.every(e => e.sets >= 1 && e.sets <= 10)), true);
eq("每个动作都有次数与休息", gymRoutines().every(r => r.ex.every(e => e.reps && e.rest)), true);
eq("每个动作都有要领", gymRoutines().every(r => r.ex.every(e => e.q)), true);
// 安全约束：脱手会砸人的动作不做
const allNames = gymRoutines().reduce((a,r) => a.concat(r.ex.map(e => e.n)), []).join(" | ");
eq("不含平板杠铃卧推", /平板.{0,4}杠铃卧推/.test(allNames), false);
eq("不含站姿杠铃肩推", /站姿杠铃/.test(allNames), false);
eq("推日有器械推胸替代", gymRoutine(0).ex.some(e => /器械推胸/.test(e.n)), true);
eq("深蹲注明深蹲架安全杆", gymRoutine(2).ex.some(e => /安全杆/.test(e.q)), true);
eq("腿日含腘绳动作", gymRoutine(2).ex.some(e => /腿弯举/.test(e.n)), true);
// 今日该练哪套 / 休息日
const savedDays = gymPlan().days.slice();
[0,1,2,3,4,5,6].forEach(i => { gymPlan().days[i] = [0,1,2,0,1,2,0][i]; });   // 构造「今天必有排课」的查表
eq("gymDayIdx 按日期算周几", [gymDayIdx("2026-09-17"), gymDayIdx(2026,8,17)], [4,4]);
eq("周四 → 拉日", gymRoutines()[gymPlan().days[4]].name, "拉");
eq("gymDayIdx 支持 ymd 字符串", gymDayIdx(ymd(new Date())), new Date().getDay());
savedDays.forEach((v,i) => { gymPlan().days[i] = v; });
eq("计划天数已还原", gymPlan().days.join(","), GYM_PLAN.days.join(","));

console.log("\\n【18】健身打卡记录（gymSaveState / 容量 / 清洗）");
DB.gym = {plan: JSON.parse(JSON.stringify(GYM_PLAN)), log:[], state:{}};
const R0 = gymRoutine(0);
const DATE = "2026-09-17";
gymSaveState(DATE, 0, 4);
eq("没有勾选 → 不写记录", DB.gym.log.length, 0);
const cur = gymStateOf(DATE, R0.name, R0.ex[0].n, 8);
cur.w[R0.ex[0].n] = 40; cur.done[R0.ex[0].n] = 4; cur.reps[R0.ex[0].n] = 10;
gymSaveState(DATE, 0, 4);
eq("勾选后写入 1 条记录", DB.gym.log.length, 1);
eq("记录组数 = 4", DB.gym.log[0].sets, 4);
eq("容量 = 40×10×4", DB.gym.log[0].vol, 1600);
eq("记录带训练名", DB.gym.log[0].rn, "推");
eq("记录带动作明细", DB.gym.log[0].ex.length, R0.ex.length);
eq("同一天重复保存不叠加", (gymSaveState(DATE, 0, 4), DB.gym.log.length), 1);
// 取消全部 → 记录应被撤销
cur.done[R0.ex[0].n] = 0;
gymSaveState(DATE, 0, 4);
eq("取消打卡后记录被撤销", DB.gym.log.length, 0);
// 没填重量则不计入容量
cur.done[R0.ex[0].n] = 2; cur.w[R0.ex[0].n] = 0;
gymSaveState(DATE, 0, 4);
eq("未填重量时容量为 0", DB.gym.log[0].vol, 0);
eq("未填重量仍记录组数", DB.gym.log[0].sets, 2);
eq("gymLogFor 能取到当天记录", gymLogFor(DATE).rn, "推");
eq("gymLogFor 取不到别的日期", gymLogFor("2020-01-01"), null);
// 「上次的重量」只认今天之前的记录
eq("gymLastWeight 命中历史", (function(){
  DB.gym.log.unshift({d:"2026-09-10", w:4, rn:"推", sets:3, vol:0, ex:[],
    wts:[{n:R0.ex[0].n, kg:37.5}]});
  return gymLastWeight(R0.ex[0].n);
})(), 37.5);
eq("gymLastWeight 忽略今天的记录", gymLastWeight(R0.ex[0].n) === 37.5, true);

// sanitize：坏数据不能让页面崩，也不能污染结构
{
  let e = null;
  try { sanitize({gym:{plan:{routines:"bad", days:"bad"}, log:"bad"}}); } catch (err) { e = err.message; }
  eq("sanitize 处理坏 gym 不抛错", e, null);
  eq("坏 routines 退回内置", sanitize({gym:{plan:{routines:"bad"}}}).gym.plan.routines.length, 3);
  eq("坏 days 退回内置", sanitize({gym:{plan:{days:"bad"}}}).gym.plan.days.length, 7);
  eq("坏 log 退回空数组", sanitize({gym:{log:"bad"}}).gym.log.length, 0);
  eq("无 gym 字段时给出完整默认", sanitize({}).gym.plan.routines.length, 3);
  eq("丢弃空动作的分类", sanitize({gym:{plan:{routines:[{name:"空",ex:[]}]}}}).gym.plan.routines.length, 3);
  eq("丢弃缺名字的动作", sanitize({gym:{plan:{routines:[{name:"X",ex:[{s:"胸"},{n:"好的"}]}]}}})
      .gym.plan.routines[0].ex.length, 1);
  eq("组数越界被夹回默认", sanitize({gym:{plan:{routines:[{name:"X",ex:[{n:"a",sets:99}]}]}}})
      .gym.plan.routines[0].ex[0].sets, 3);
  eq("log 过滤坏条目", sanitize({gym:{log:[{d:"2026-09-17",rn:"推"},{bad:1},null]}}).gym.log.length, 1);
  eq("log 缺字段被补 0", sanitize({gym:{log:[{d:"2026-09-17",rn:"推"}]}}).gym.log[0].sets, 0);
  eq("plan.notes 被保留", sanitize({gym:{plan:{notes:[{t:"有氧",b:"低强度"}]}}}).gym.plan.notes.length, 1);
  // ⚠️ 历史 bug 回归（v1.7 修复）：sanitize 没保留 gym.state → 刷新后勾选与每组重量全丢
  const rt = sanitize({gym:{state:{"2026-09-17|推":{w:{"坐姿器械推胸":42.5},done:{"坐姿器械推胸":3},reps:{"坐姿器械推胸":10}}}}});
  eq("sanitize 保留 gym.state 的键", Object.keys(rt.gym.state).length, 1);
  eq("sanitize 保留每组重量", rt.gym.state["2026-09-17|推"].w["坐姿器械推胸"], 42.5);
  eq("sanitize 保留每组完成数", rt.gym.state["2026-09-17|推"].done["坐姿器械推胸"], 3);
  eq("sanitize 保留每组次数", rt.gym.state["2026-09-17|推"].reps["坐姿器械推胸"], 10);
  eq("sanitize 无 state 时也返回对象", typeof sanitize({}).gym.state, "object");
  eq("sanitize 清掉非数字的重量", Object.keys(sanitize({gym:{state:{"k":{w:{"a":"坏"},done:{},reps:{}}}}}).gym.state).length, 0);
  eq("sanitize 处理坏 state 类型", Object.keys(sanitize({gym:{state:"bad"}}).gym.state).length, 0);
}
// 完整往返：save → loadDB → sanitize（真实刷新路径，守住「刷新崩」这类回归）
DB = ensureCustomTasks(DEF());
DB.checkins["2026-09-17"] = ["en-vocab"];
DB.gym.state = {"2026-09-17|推":{w:{"坐姿器械推胸":40}, done:{"坐姿器械推胸":3}, reps:{"坐姿器械推胸":10}}};
gymSaveState("2026-09-17", 0, 4);
save();
let e3 = null;
try { DB = ensureCustomTasks(sanitize(JSON.parse(localStorage.getItem("orstudy.v1")))); }
catch (err) { e3 = err.message; }
eq("带健身数据的存储往返不抛错", e3, null);
eq("往返后健身记录完好", DB.gym.log.length, 1);
eq("往返后容量完好", DB.gym.log[0].vol, 1200);
eq("往返后训练计划完好", DB.gym.plan.routines.length, 3);
eq("往返后已打卡数据完好", DB.checkins["2026-09-17"].length, 1);
// 逐组状态也要活过刷新（历史 bug：刷新后勾选与重量全丢）
eq("往返后逐组状态还在", !!DB.gym.state["2026-09-17|推"], true);
eq("往返后重量还在", DB.gym.state["2026-09-17|推"].w["坐姿器械推胸"], 40);
eq("往返后完成组数还在", DB.gym.state["2026-09-17|推"].done["坐姿器械推胸"], 3);
DB.gym = {plan: JSON.parse(JSON.stringify(GYM_PLAN)), log:[], state:{}};

console.log("\\n" + "=".repeat(46));
console.log("  通过 " + pass + " 项，失败 " + fail + " 项");
console.log("=".repeat(46));
if (fail > 0) process.exitCode = 1;
`;

eval(stubs + logic + tests);
