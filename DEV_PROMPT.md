# 下一次继续开发的提示词（直接整体复制给 AI）

你是一个前端 + 小程序开发助手，现在要接手一个已经基本成型的“饮食记录与营养计算”项目（Web + 微信小程序），需要在现有基础上继续迭代。

## 项目结构

- Web 单页应用（原始版本）：`fitness-diet/index.html`  
  - 使用纯 HTML + 内联 CSS/JS，逻辑完整，包括：
    - 基础配置：身高、体重、性别、阶段、训练/休息日、三大营养素参数、配额表自动填写
    - 今日用餐记录：早餐/午餐/晚餐三餐记录 + 食物库
    - 今日统计：根据记录和目标计算 P/C/F 进度条
    - 排行榜 + 在线同步：使用 Supabase（现在主要作为逻辑参考）
- 微信小程序版本：目录 `miniprogram-1/miniprogram`
  - 入口页面：`pages/index/index`（首页）
  - 配额表页面：`pages/quota/index`
  - 食物库页面：`pages/foods/index`
  - 排行榜页面：`pages/rank/index`
  - 公共工具：
    - `utils/storage.js`：封装小程序本地存储（等价于 Web 版 `loadJSON/saveJSON`）
    - `utils/quota.js`：配额表数据与算法（从 Web 版迁移）
  - 云函数（在 `cloudfunctions` 下）：
    - `login`：返回当前用户 openid
    - `rank`：排行榜读写（集合名 `leaderboard_daily`）

## 当前小程序功能概况

1. **登录与云开发**
   - 已使用云开发环境（需要在 `app.js` 中配置 `env`）。
   - 首页通过云函数 `login` 获取 `openid`，并存到 `wx.getStorageSync('openid')` 与 `app.globalData.openid`。

2. **首页 `pages/index/index`**
   - 顶部：登录状态 + `openid` + 当前日期 `dateStr`（`todayStr()`）。
   - **基础配置**
     - 数据结构：`settings`，通过 `normalizeSettings` + `STORAGE_KEYS.SETTINGS` 持久化。
     - 字段：`heightCm, weightKg, gender, phase, dayType, proteinPerKg, carbsTrainingPerKg, carbsRestPerKg, fatGrams`。
     - 按钮：
       - 「查看配额表」→ `wx.navigateTo('/pages/quota/index')`
       - 「按配额表自动填写」→ 调用 `suggestMacrosFromQuotaTable` + `defaultFatGrams`
       - 「保存配置」→ 写入本地、刷新「今日统计」。
   - **今日统计**
     - 使用 `calcDayTotals(dayLog, foods)` 求出当前日期全部餐次的 P/C/F 总和；
     - 使用 `calcDailyTargets(settings)` 求目标值；
     - 结果放入 `daySummary`，用进度条展示百分比。
   - **今日用餐**
     - 本地存储键：`STORAGE_KEYS.LOGS`，`logs[dateStr]` 下有三餐 `meals`。
     - UI：三张卡片（早餐/午餐/晚餐），每张卡片包含：
       - 选择食物（从当前 `foods` 数组中选择，`systemBuiltIn` + 用户自定义混合）。
       - 输入重量（g），点击「添加到某餐」→ 生成 `entry`（包含 `id, foodId, grams, macros`）。
       - 下方列表展示每条记录以及删除按钮（触发 `onDeleteEntryTap`）。
     - 任何增删记录后，都会调用 `updateMealsForToday` 重新计算小计与「今日统计」。
   - **入口按钮**
     - 「食物库 → 打开」→ `onOpenFoodsPage()` 跳转 `pages/foods/index`
     - 「排行榜 → 打开」→ `onOpenRankPage()` 跳转 `pages/rank/index`，并带上当前日期。

3. **配额表页面 `pages/quota/index`**
   - 使用 `QUOTA_DIMENSIONS + QUOTA_RAW` 构建配额表网格：
     - 顶部 segmented 切换：性别 male/female、阶段 bulk/cut。
     - 表头：身高；首列：体重；单元格：`训/休/蛋` 三个 g/kg 数字。
   - 点击某个格子：
     - 计算出对应的 `proteinPerKg / carbsTrainingPerKg / carbsRestPerKg` 与默认 `fatGrams`；
     - 把结果写入本地 `STORAGE_KEYS.SETTINGS`；
     - `wx.navigateBack()` 返回首页，首页下次 `onLoad`/`initSettings` 会读到最新配置。

4. **食物库页面 `pages/foods/index`**
   - 展示 & 管理所有食物（内置 + 用户自定义）。
   - 支持新增自定义食物（名称 + 每 100g 的 P/C/F），写入 `STORAGE_KEYS.FOODS`。
   - 支持删除非系统食物（系统食物只读）。
   - 首页「今日用餐」使用相同的数据源（同一个存储 key）。

5. **排行榜页面 `pages/rank/index`**
   - 使用云函数 `rank` + 集合 `leaderboard_daily`。
   - 顶部：日期选择 + Tab（kcal / 力量），可刷新当前日期榜单。
   - 中部：列表展示每个用户的 kcal 或三大项 1RM（包括体重）。
   - 底部「我的今日数据」：
     - 手动填写卧推/硬拉/深蹲 1RM。
     - 程序会从本地 `SETTINGS` 读取体重，从 `LOGS` 读取当前日期的用餐记录，计算 P/C/F 与 kcal；
     - 调用云函数 `rank` 的 `upload` 动作写入/更新当天自己的记录。

## 下次接入时需要注意的点

1. **不要改动本地存储 key 名称**（`STORAGE_KEYS`），否则会读不到之前的数据。
2. **首页是状态“中心”**：
   - 配额表页、食物库页、排行榜页都通过本地存储与首页共享数据；
   - 如需扩展字段，请同步更新工具方法（`normalizeSettings/normalizeFoods` 等）。
3. **云函数与集合名称不要随意改动**：
   - 云函数：`login`、`rank`
   - 集合：`leaderboard_daily`
4. **如果要对排行榜做更复杂的排序/过滤，可以扩展云函数 `rank` 的 `get` 分支，而不是在前端写死逻辑。**

## 建议你（AI）下次接手的工作顺序

1. 先快速阅读以下文件以建立整体印象：
   - `miniprogram-1/miniprogram/pages/index/index.js` / `.wxml` / `.wxss`
   - `miniprogram-1/miniprogram/utils/storage.js`
   - `miniprogram-1/miniprogram/utils/quota.js`
   - `miniprogram-1/miniprogram/pages/quota/index.*`
   - `miniprogram-1/miniprogram/pages/foods/index.*`
   - `miniprogram-1/miniprogram/pages/rank/index.*`
2. 使用与当前设计风格一致的 UI（简洁、卡片式、数值信息清晰）。
3. 对任何涉及“同步/云函数”的改动，要保证在无网络情况下，小程序仍能作为纯本地饮食记录工具正常使用。

如果你理解了上面的项目背景和结构，请从用户的当前需求出发，先用 2–3 句话复述目标，再提出一个合理的实现方案，并直接开始修改代码（优先从小范围文件入手）。**

