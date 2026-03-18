# 饮食记录与营养计算 · 微信小程序

本目录是“饮食记录与营养计算”工具的 **微信小程序版本**，已不再维护 Web 版，仅保留 `fitness-diet/` 作为早期实现的参考。

小程序以 **本地饮食记录为主，云端排行榜为辅**，在无网络情况下仍然可以完整使用本地的记录和统计功能。

---

## 1. 目录结构概览

- `miniprogram/`
  - `app.js / app.json / app.wxss`：小程序入口与全局样式
  - `envList.js`：云环境配置（需要在微信开发者工具里关联自己的云环境）
  - `utils/`
    - `storage.js`：封装本地存储（JSON 序列化）
    - `quota.js`：配额表数据与算法逻辑（从 Web 版迁移）
  - `pages/index/`：**首页**，状态中心
  - `pages/quota/`：配额表选择页面
  - `pages/foods/`：食物库管理（内置 + 自定义）
  - `pages/rank/`：排行榜（今日 kcal / 力量三大项，表格式、可点表头排序、含体重列）
  - `pages/strength/`：力量数据录入与展示
  - `pages/profile/`：用户资料（昵称、头像）相关
  - `components/cloudTipModal/`：云开发引导组件（官方模板带的，可选）

- `cloudfunctions/`
  - `login`：获取当前用户 `openid`
  - `rank`：排行榜读写，集合名 `leaderboard_daily`（kcal 按日期）+ `leaderboard_strength_latest`（力量榜每用户一条最新）
  - `profile`：用户昵称、头像等资料存取
  - `quickstartFunctions`：官方示例，可忽略

---

## 2. 本地存储约定（不要随意改 key）

统一通过 `utils/storage.js` 读写，键名集中在 `STORAGE_KEYS` 中维护：

- `SETTINGS`：`nutritionApp_settings`
  - 包含：`heightCm, weightKg, gender, phase, dayType, proteinPerKg, carbsTrainingPerKg, carbsRestPerKg, fatGrams` 等
- `FOODS`：`nutritionApp_foods`
  - 内置 + 用户自定义食物列表（每 100g 的 P/C/F）
- `LOGS`：`nutritionApp_logs`
  - 每日三餐记录：`logs[dateStr].meals[].entries[]`
- `RANK_PROFILE`：`nutritionApp_rankProfile`
  - 与排行榜上传相关的轻量信息（如最近一次上传签名等，可按需扩展）
- `PROFILE`：`nutritionApp_profile`
  - 用户昵称、头像等资料缓存

**注意：**不要随意修改 `STORAGE_KEYS` 中的 key 名称，否则会导致老数据无法读取。

---

## 3. 首页 = 状态中心

首页 `pages/index/index` 是整个小程序的“状态中枢”，负责：

- 读取 / 初始化 `SETTINGS`、`FOODS`、`LOGS`
- 维护今日三餐 `mealsForToday` 和 `daySummary`（P/C/F 进度条）
- 负责触发自动上传 kcal 到排行榜（登录且有云环境时）

其它页面只做“局部编辑”：

- 配额表页：写回 `SETTINGS`，再 `navigateBack`，由首页在下次 `onShow` 读取
- 食物库页：写回 `FOODS`，首页在 `onShow` 时刷新
- 排行榜页：只读云函数 `rank` 的数据，不修改本地日志

---

## 4. 排行榜与离线策略

- 依赖云函数 `rank`，榜单数据集合：
  - `leaderboard_daily`：**每日 kcal**（按 `date` 存一条/人/天）
  - `leaderboard_strength_latest`：**力量榜**（按 `_openid` 存一条/人，始终为最新力量数据）
  用户资料来自集合 `users`（云函数 `profile` 写入）。
- **今日 kcal**：表格列为 排名 / 头像 / 用户名 / kcal / P / C / F / 体重（体重仅展示）；默认按 kcal 降序，可点表头按 P/C/F 排序。
- **力量（三大项）**：表格列为 排名 / 头像 / 用户名 / 卧推 / 硬拉 / 深蹲 / 系数（三大项和÷体重）/ 体重；默认按系数降序，可点表头按单项或体重排序。
- 页面加载或点击“刷新榜单”时调用 `rank` 的 `get`：
  - kcal：传入 `type: 'kcal'` + `date`
  - 力量：传入 `type: 'strength'`（**不与日期关联**）
  云函数会扁平化返回，并将 `cloud://` 头像 fileID 转换为临时 https 链接（`getTempFileURL`）以便所有用户可见。
- 若 **未开启云开发** 或 **网络错误**：页面对用户展示 `rankError` 提示，不影响首页本地记录与统计。
- 排序与系数计算在前端完成；若需服务端排序或过滤，可扩展云函数 `rank` 的 `get`。

---

## 5. 开发与调试提示

1. 在微信开发者工具中打开本目录（即 `miniprogram-1/`）  
2. 在“云开发”面板中创建或选择一个环境，并在 `envList.js` / `app.js` 中配置对应 `envId`  
3. 首次运行时，首页会自动初始化默认配置与空日志；你可以：
   - 先在“基础配置”中写入身高/体重
   - 通过“配额表”一键回填三大营养素
   - 在“今日用餐”中添加几条记录，观察“今日统计”进度条变化
4. 登录后，排行榜相关功能才会生效，但即使不登录，小程序仍可以作为**纯本地饮食记录工具**使用。

---

## 6. 上线前检查（测试版）

- **云开发**：在微信开发者工具中确认已关联云环境，`app.js` / `envList.js` 中的 `envId` 正确。
- **云函数**：需上传并部署 `login`、`rank`、`profile`；排行榜依赖 `rank` 的 get/upload，昵称/头像依赖 `profile` 与 `rank` 从 `users` 集合读取。
- **集合**：云数据库中需有：
  - `leaderboard_daily`（kcal 按日期存储）
  - `leaderboard_strength_latest`（力量榜每用户一条最新）
  - `users`（用户昵称、头像，由 profile 页保存后写入）
- **本地存储**：不要修改 `STORAGE_KEYS` 的 key 名，避免老用户数据无法读取。
- **潜在注意点**：若云库中 `users` 或 `leaderboard_daily` 的文档结构与此前实现不一致（例如 `_openid` 在嵌套的 `data` 下），需在对应云函数中调整 `where` 条件（如 `data._openid`）；首次上线建议在真机与模拟器各测一遍登录、资料保存、排行榜刷新与上传。

## 7. 后续可以改进的方向（备忘）

- 对首页配置输入做更细致的数值范围和提示（已初步加入基础防呆）；
- 提升排行榜在弱网/离线时的交互体验（已加入错误提示与说明）；
- 如需扩展字段（例如更多训练/习惯数据），请同步更新：
  - `SETTINGS` 结构 + `normalizeSettings`
  - `LOGS` 结构 + 相关统计方法。
