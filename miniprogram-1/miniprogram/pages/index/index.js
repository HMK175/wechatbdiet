// pages/index/index.js
const app = getApp();
const { STORAGE_KEYS, loadJSON, saveJSON } = require("../../utils/storage");
const { suggestMacrosFromQuotaTable, defaultFatGrams } = require("../../utils/quota");

// 近似取自常见营养成分表（每 100g，可按需微调）
const BUILT_IN_FOODS = [
  // 鸡蛋相关
  { id: "egg", name: "鸡蛋（全蛋）", proteinPer100g: 13, carbsPer100g: 1.3, fatPer100g: 11, systemBuiltIn: true },
  { id: "egg_white", name: "鸡蛋白", proteinPer100g: 11, carbsPer100g: 0.7, fatPer100g: 0.2, systemBuiltIn: true },

  // 常见肉类
  { id: "chicken_leg", name: "鸡腿", proteinPer100g: 18, carbsPer100g: 0, fatPer100g: 8, systemBuiltIn: true },
  { id: "duck_leg", name: "鸭腿", proteinPer100g: 17, carbsPer100g: 0, fatPer100g: 12, systemBuiltIn: true },
  { id: "pork_lean", name: "猪肉（瘦）", proteinPer100g: 20, carbsPer100g: 0, fatPer100g: 6, systemBuiltIn: true },

  // 主食
  { id: "noodles", name: "面条", proteinPer100g: 10, carbsPer100g: 70, fatPer100g: 2, systemBuiltIn: true },
  { id: "rice_cooked", name: "米饭（熟）", proteinPer100g: 2.6, carbsPer100g: 28, fatPer100g: 0.3, systemBuiltIn: true },
];

const DEFAULT_SETTINGS = {
  heightCm: 170,
  weightKg: 60,
  gender: "male", // male | female
  phase: "bulk", // bulk | cut
  dayType: "training", // training | rest
  proteinPerKg: 1.6,
  carbsTrainingPerKg: 4.0,
  carbsRestPerKg: 3.0,
  fatGrams: 70,
};

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function normalizeFoods(foods) {
  const safe = Array.isArray(foods) ? foods : [];
  const userFoods = safe.filter((f) => f && f.id && !f.systemBuiltIn);
  const normalizedBuiltIns = BUILT_IN_FOODS.map((bf) => ({ ...bf, systemBuiltIn: true }));
  return [...normalizedBuiltIns, ...userFoods];
}

function calcEntryMacros(food, grams) {
  const factor = grams / 100;
  return {
    protein: food.proteinPer100g * factor,
    carbs: food.carbsPer100g * factor,
    fat: food.fatPer100g * factor,
  };
}

function getOrCreateDayLog(logs, dateStr) {
  if (!logs[dateStr]) {
    logs[dateStr] = {
      date: dateStr,
      meals: [
        { id: "breakfast", name: "早餐", entries: [] },
        { id: "lunch", name: "午餐", entries: [] },
        { id: "dinner", name: "晚餐", entries: [] },
      ],
    };
  }
  return logs[dateStr];
}

function normalizeSettings(s) {
  const base = { ...DEFAULT_SETTINGS, ...(s && typeof s === "object" ? s : {}) };
  base.gender = base.gender === "female" ? "female" : "male";
  base.phase = base.phase === "cut" ? "cut" : "bulk";
  base.dayType = base.dayType === "rest" ? "rest" : "training";
  base.heightCm = Number(base.heightCm) || DEFAULT_SETTINGS.heightCm;
  base.weightKg = Number(base.weightKg) || DEFAULT_SETTINGS.weightKg;
  base.proteinPerKg = Number(base.proteinPerKg) || DEFAULT_SETTINGS.proteinPerKg;
  base.carbsTrainingPerKg = Number(base.carbsTrainingPerKg) || DEFAULT_SETTINGS.carbsTrainingPerKg;
  base.carbsRestPerKg = Number(base.carbsRestPerKg) || DEFAULT_SETTINGS.carbsRestPerKg;
  base.fatGrams = Number(base.fatGrams);
  if (!Number.isFinite(base.fatGrams)) {
    base.fatGrams = defaultFatGrams(base.gender, base.phase);
  }
  return base;
}

function getCarbsPerKgForDay(settings) {
  return settings.dayType === "rest" ? settings.carbsRestPerKg : settings.carbsTrainingPerKg;
}

function calcDailyTargets(settings) {
  const carbsPerKg = getCarbsPerKgForDay(settings);
  return {
    proteinTarget: settings.weightKg * settings.proteinPerKg,
    carbsTarget: settings.weightKg * carbsPerKg,
    fatTarget: settings.fatGrams,
  };
}

function calcDayTotals(dayLog, foods) {
  if (!dayLog) return { protein: 0, carbs: 0, fat: 0 };
  let protein = 0,
    carbs = 0,
    fat = 0;
  (dayLog.meals || []).forEach((meal) => {
    (meal.entries || []).forEach((entry) => {
      const food = foods.find((f) => f.id === entry.foodId);
      if (!food) return;
      const macros = entry.macros || calcEntryMacros(food, entry.grams);
      protein += macros.protein;
      carbs += macros.carbs;
      fat += macros.fat;
    });
  });
  return { protein, carbs, fat };
}

function buildDisplayFoods(foods, foodStats) {
  const stats = foodStats || {};
  const arr = Array.isArray(foods) ? [...foods] : [];
  arr.sort((a, b) => {
    const ua = stats[a.id] || 0;
    const ub = stats[b.id] || 0;
    if (ub !== ua) return ub - ua; // 使用次数多的在前
    const sa = a.systemBuiltIn ? 0 : 1;
    const sb = b.systemBuiltIn ? 0 : 1;
    if (sa !== sb) return sa - sb; // 系统内置食物排在自定义前
    return a.name.localeCompare(b.name, "zh-CN");
  });
  return arr;
}

Page({
  data: {
    loggedIn: false,
    openid: "",
    userLabel: "",

    settings: normalizeSettings(null),
    daySummary: [],

    dateStr: todayStr(),
    foods: [],
    displayFoods: [],
    foodStats: {},
    logs: {},
    mealsForToday: [],
    formState: {
      breakfast: { foodIndex: -1, grams: "" },
      lunch: { foodIndex: -1, grams: "" },
      dinner: { foodIndex: -1, grams: "" },
    },

    foodForm: {
      name: "",
      protein: "",
      carbs: "",
      fat: "",
    },
    headerAvatarUrl: "",
    userLabelDisplay: "",

    openFoodDropdownMealId: "",
  },

  _kcalUploadTimer: null,
  _lastKcalUploadSigByDate: {},

  onLoad() {
    // 从本地尝试恢复 openid
    const storedOpenid = wx.getStorageSync("openid");
    if (storedOpenid) {
      const userLabel = String(storedOpenid).slice(0, 8);
      this.setData({
        loggedIn: true,
        openid: storedOpenid,
        userLabel,
        userLabelDisplay: userLabel,
      });
      if (!app.globalData) app.globalData = {};
      app.globalData.openid = storedOpenid;
      this.refreshProfileLabel();
    }

    const foodStats = loadJSON(STORAGE_KEYS.FOOD_STATS, {}) || {};
    this.setData({ foodStats });

    this.initSettings();
    this.initFoodsAndLogs();
  },

  onShow() {
    // 从其他页面（如食物库页）返回时，刷新 foods/settings/logs，保证下拉列表能看到最新食物
    const settings = normalizeSettings(loadJSON(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS));
    const storedFoods = loadJSON(STORAGE_KEYS.FOODS, null);
    const foods = normalizeFoods(storedFoods && Array.isArray(storedFoods) ? storedFoods : []);
    const logs = loadJSON(STORAGE_KEYS.LOGS, {}) || {};
    const dayLog = getOrCreateDayLog(logs, this.data.dateStr);
    this.setData(
      {
        settings,
        foods,
        logs,
      },
      () => {
        const displayFoods = buildDisplayFoods(this.data.foods, this.data.foodStats);
        this.setData({ displayFoods });
        this.updateMealsForToday(dayLog);
      }
    );
  },

  buildKcalLeaderboardPayload(dateStr) {
    const { settings, logs, foods } = this.data;
    const dayLog = getOrCreateDayLog(logs, dateStr);
    const totals = calcDayTotals(dayLog, foods);
    const kcal =
      (Number(totals.protein) || 0) * 4 +
      (Number(totals.carbs) || 0) * 4 +
      (Number(totals.fat) || 0) * 9;
    const bw = Number(settings.weightKg);
    return {
      date: dateStr,
      bodyweight_kg: bw,
      kcal: Math.round(kcal),
      protein_g: Number(totals.protein.toFixed(1)),
      carbs_g: Number(totals.carbs.toFixed(1)),
      fat_g: Number(totals.fat.toFixed(1)),
      bench_1rm: null,
      deadlift_1rm: null,
      squat_1rm: null,
    };
  },

  scheduleAutoUploadKcal(dateStr, { reason = "" } = {}) {
    // 仅登录后自动上传，避免无意中把数据写入云端
    if (!this.data.loggedIn) return;
    if (!wx.cloud) return;
    const d = dateStr || this.data.dateStr;
    if (!d) return;

    if (this._kcalUploadTimer) clearTimeout(this._kcalUploadTimer);
    this._kcalUploadTimer = setTimeout(async () => {
      try {
        const payload = this.buildKcalLeaderboardPayload(d);
        if (!payload.bodyweight_kg || payload.bodyweight_kg <= 0) return;
        // 如果当天没有任何摄入，避免把已有的云端记录覆盖成 0
        if (
          (!payload.kcal || payload.kcal <= 0) &&
          (!payload.protein_g || payload.protein_g <= 0) &&
          (!payload.carbs_g || payload.carbs_g <= 0) &&
          (!payload.fat_g || payload.fat_g <= 0)
        ) {
          return;
        }

        const sig = `${payload.bodyweight_kg}|${payload.kcal}|${payload.protein_g}|${payload.carbs_g}|${payload.fat_g}`;
        if (this._lastKcalUploadSigByDate[d] === sig) return;

        await wx.cloud.callFunction({
          name: "rank",
          data: { action: "upload", payload },
        });
        this._lastKcalUploadSigByDate[d] = sig;
        // 可选：静默，不打扰用户；需要提示可以改为 showToast
        console.log("auto upload kcal ok", { date: d, reason });
      } catch (e) {
        console.warn("auto upload kcal failed", e);
      }
    }, 10_000);
  },

  initSettings() {
    const stored = loadJSON(STORAGE_KEYS.SETTINGS, null);
    const settings = normalizeSettings(stored || DEFAULT_SETTINGS);
    saveJSON(STORAGE_KEYS.SETTINGS, settings);
    this.setData({ settings });
  },

  initFoodsAndLogs() {
    const storedFoods = loadJSON(STORAGE_KEYS.FOODS, null);
    const foods = normalizeFoods(storedFoods && Array.isArray(storedFoods) ? storedFoods : []);
    saveJSON(STORAGE_KEYS.FOODS, foods);

    const logs = loadJSON(STORAGE_KEYS.LOGS, {});
    const dayLog = getOrCreateDayLog(logs, this.data.dateStr);

    this.setData(
      {
        foods,
        logs,
      },
      () => {
        const displayFoods = buildDisplayFoods(this.data.foods, this.data.foodStats);
        this.setData({ displayFoods });
        this.updateMealsForToday(dayLog);
      }
    );
  },

  rebuildDisplayFoods() {
    const displayFoods = buildDisplayFoods(this.data.foods, this.data.foodStats);
    this.setData({ displayFoods });
  },

  bumpFoodUsage(foodId) {
    if (!foodId) return;
    const stats = { ...(this.data.foodStats || {}) };
    stats[foodId] = (stats[foodId] || 0) + 1;
    this.setData({ foodStats: stats });
    saveJSON(STORAGE_KEYS.FOOD_STATS, stats);
  },

  onLoginTap() {
    if (!wx.cloud) {
      wx.showToast({ title: "当前基础库不支持云函数", icon: "none" });
      return;
    }
    this._loggingIn = true;
    wx.showLoading({ title: "登录中...", mask: true });
    wx.cloud.callFunction({
      name: "login",
      data: {},
      success: (res) => {
        const openid = res && res.result && res.result.openid;
        if (!openid) {
          wx.showToast({ title: "登录失败：无 openid", icon: "none" });
          return;
        }
        wx.setStorageSync("openid", openid);
        if (!app.globalData) app.globalData = {};
        app.globalData.openid = openid;
        const userLabel = String(openid).slice(0, 8);
        this.setData({
          loggedIn: true,
          openid,
          userLabel,
          userLabelDisplay: userLabel,
        });
        wx.showToast({ title: "登录成功", icon: "success" });
        this.refreshProfileLabel();
      },
      fail: (err) => {
        console.error("login cloud function error", err);
        wx.showToast({ title: "登录失败，请稍后重试", icon: "none" });
      },
      complete: () => {
        if (this._loggingIn) {
          this._loggingIn = false;
          if (wx.hideLoading) {
            wx.hideLoading();
          }
        }
      },
    });
  },

  async refreshProfileLabel() {
    try {
      const res = await wx.cloud.callFunction({ name: "profile", data: { action: "get" } });
      const p = (res.result && res.result.data) || {};
      const nickname = String(p.nickname || "").trim();
      const avatarUrl = p.avatarUrl || "";
      const label = nickname || this.data.userLabel || "";
      this.setData({
        userLabel: label,
        userLabelDisplay: label,
        headerAvatarUrl: avatarUrl,
      });
      saveJSON(STORAGE_KEYS.PROFILE, { nickname: nickname || "", avatarUrl });
    } catch (e) {
      // ignore
    }
  },

  updateMealsForToday(dayLogRaw) {
    const { foods, settings } = this.data;
    const dayLog = dayLogRaw || getOrCreateDayLog(this.data.logs, this.data.dateStr);

    const mealsForToday = (dayLog.meals || []).map((meal) => {
      let protein = 0;
      let carbs = 0;
      let fat = 0;

      const entries = (meal.entries || []).map((entry) => {
        const food = foods.find((f) => f.id === entry.foodId);
        if (!food) {
          return {
            id: entry.id,
            text: "（已删除食物）",
            subText: `${entry.grams} g`,
            deleted: true,
          };
        }
        const macros = entry.macros || calcEntryMacros(food, entry.grams);
        protein += macros.protein;
        carbs += macros.carbs;
        fat += macros.fat;
        return {
          id: entry.id,
          text: `${food.name} · ${entry.grams} g`,
          subText: `P ${macros.protein.toFixed(1)} · C ${macros.carbs.toFixed(1)} · F ${macros.fat.toFixed(1)}`,
          deleted: false,
        };
      });

      const summary = `小计：P ${protein.toFixed(1)} · C ${carbs.toFixed(1)} · F ${fat.toFixed(1)}`;

      return {
        id: meal.id,
        name: meal.name,
        summary,
        entries,
      };
    });

    this.setData({ mealsForToday });

    const totals = calcDayTotals(dayLog, foods);
    const targets = calcDailyTargets(normalizeSettings(settings));
    const items = [
      { key: "protein", label: "蛋白质", color: "#2f80ed", current: totals.protein, target: targets.proteinTarget },
      { key: "carbs", label: "碳水", color: "#27ae60", current: totals.carbs, target: targets.carbsTarget },
      { key: "fat", label: "脂肪", color: "#f2c94c", current: totals.fat, target: targets.fatTarget },
    ].map((it) => {
      const percent = !it.target || it.target <= 0 ? 0 : Math.min(200, Math.round((it.current / it.target) * 100));
      return {
        key: it.key,
        label: it.label,
        color: it.color,
        currentText: `${it.current.toFixed(1)} g`,
        targetText: `${it.target.toFixed(0)} g`,
        percent,
        over: percent > 100,
      };
    });
    this.setData({ daySummary: items });
  },

  onDateChange(e) {
    const dateStr = e.detail.value;
    const logs = this.data.logs;
    const dayLog = getOrCreateDayLog(logs, dateStr);
    saveJSON(STORAGE_KEYS.LOGS, logs);
    this.setData(
      {
        dateStr,
        logs,
      },
      () => {
        this.updateMealsForToday(dayLog);
      }
    );
  },

  // ====== 基础配置相关 ======
  onHeightInput(e) {
    // 允许清空或全选替换，不再在输入时强制还原；保存与计算时由 normalizeSettings 兜底
    this.setData({
      "settings.heightCm": e.detail.value,
    });
  },

  onWeightInput(e) {
    this.setData({
      "settings.weightKg": e.detail.value,
    });
  },

  onGenderTap(e) {
    const gender = e.currentTarget.dataset.gender === "female" ? "female" : "male";
    this.setData({ "settings.gender": gender });
    const settings = normalizeSettings(this.data.settings);
    saveJSON(STORAGE_KEYS.SETTINGS, settings);
    const dayLog = getOrCreateDayLog(this.data.logs, this.data.dateStr);
    this.updateMealsForToday(dayLog);
  },

  onPhaseTap(e) {
    const phase = e.currentTarget.dataset.phase === "cut" ? "cut" : "bulk";
    this.setData({ "settings.phase": phase });
    const settings = normalizeSettings(this.data.settings);
    saveJSON(STORAGE_KEYS.SETTINGS, settings);
    const dayLog = getOrCreateDayLog(this.data.logs, this.data.dateStr);
    this.updateMealsForToday(dayLog);
  },

  onDayTypeChange(e) {
    const type = e.currentTarget.dataset.type === "rest" ? "rest" : "training";
    this.setData({
      "settings.dayType": type,
    });
    const settings = normalizeSettings(this.data.settings);
    saveJSON(STORAGE_KEYS.SETTINGS, settings);
    const dayLog = getOrCreateDayLog(this.data.logs, this.data.dateStr);
    this.updateMealsForToday(dayLog);
  },

  onProteinPerKgInput(e) {
    this.setData({
      "settings.proteinPerKg": e.detail.value,
    });
  },

  onCarbsTrainingInput(e) {
    this.setData({
      "settings.carbsTrainingPerKg": e.detail.value,
    });
  },

  onCarbsRestInput(e) {
    this.setData({
      "settings.carbsRestPerKg": e.detail.value,
    });
  },

  onFatInput(e) {
    this.setData({
      "settings.fatGrams": e.detail.value,
    });
  },

  onSaveSettingsTap() {
    const settings = normalizeSettings(this.data.settings);

    // 基础防呆：数值范围简单校验，避免极端配置导致统计结果失真
    if (settings.heightCm < 130 || settings.heightCm > 220) {
      wx.showToast({ title: "身高建议在 130–220 cm 之间", icon: "none" });
      return;
    }
    if (settings.weightKg < 30 || settings.weightKg > 200) {
      wx.showToast({ title: "体重建议在 30–200 kg 之间", icon: "none" });
      return;
    }
    if (settings.proteinPerKg <= 0 || settings.proteinPerKg > 4) {
      wx.showToast({ title: "蛋白建议在 0–4 g/kg 之间", icon: "none" });
      return;
    }
    if (settings.carbsTrainingPerKg < 0 || settings.carbsTrainingPerKg > 8) {
      wx.showToast({ title: "训练日碳水建议在 0–8 g/kg 之间", icon: "none" });
      return;
    }
    if (settings.carbsRestPerKg < 0 || settings.carbsRestPerKg > 6) {
      wx.showToast({ title: "休息日碳水建议在 0–6 g/kg 之间", icon: "none" });
      return;
    }
    if (settings.fatGrams < 10 || settings.fatGrams > 200) {
      wx.showToast({ title: "每日脂肪建议在 10–200 g 之间", icon: "none" });
      return;
    }

    saveJSON(STORAGE_KEYS.SETTINGS, settings);
    this.setData({ settings });
    const dayLog = getOrCreateDayLog(this.data.logs, this.data.dateStr);
    this.updateMealsForToday(dayLog);
    wx.showToast({ title: "已保存配置", icon: "success" });
    this.scheduleAutoUploadKcal(this.data.dateStr, { reason: "saveSettings" });
  },

  // ====== 跳转到其他页面 ======
  onOpenQuotaPage() {
    wx.navigateTo({
      url: "/pages/quota/index",
    });
  },

  onOpenFoodsPage() {
    wx.navigateTo({
      url: "/pages/foods/index",
    });
  },

  onOpenRankPage() {
    wx.navigateTo({
      url: `/pages/rank/index?date=${this.data.dateStr}`,
    });
  },

  onOpenStrengthPage() {
    wx.navigateTo({
      url: `/pages/strength/index?date=${this.data.dateStr}`,
    });
  },

  onHeaderUserTap() {
    wx.navigateTo({
      url: "/pages/profile/index",
    });
  },

  onAutoFromQuotaTap() {
    const norm = normalizeSettings(this.data.settings);
    const { heightCm, weightKg, gender, phase } = norm;
    if (!heightCm || heightCm <= 0 || !weightKg || weightKg <= 0) {
      wx.showToast({ title: "请先填写身高和体重", icon: "none" });
      return;
    }
    const suggestion = suggestMacrosFromQuotaTable({ gender, phase, heightCm, weightKg });
    if (!suggestion) {
      wx.showToast({ title: "当前身高体重超出配额表范围", icon: "none" });
      return;
    }
    const settings = {
      ...this.data.settings,
      proteinPerKg: suggestion.proteinPerKg,
      carbsTrainingPerKg: suggestion.carbsTrainingPerKg,
      carbsRestPerKg: suggestion.carbsRestPerKg,
      fatGrams: defaultFatGrams(gender, phase),
    };
    const normalized = normalizeSettings(settings);
    saveJSON(STORAGE_KEYS.SETTINGS, normalized);
    this.setData({ settings: normalized });
    const dayLog = getOrCreateDayLog(this.data.logs, this.data.dateStr);
    this.updateMealsForToday(dayLog);
    wx.showToast({ title: "已按配额表填写", icon: "success" });
  },

  onToggleFoodDropdown(e) {
    const mealId = e.currentTarget.dataset.mealId;
    if (!mealId) return;
    const next = this.data.openFoodDropdownMealId === mealId ? "" : mealId;
    this.setData({ openFoodDropdownMealId: next });
  },

  onPickFoodFromDropdown(e) {
    const mealId = e.currentTarget.dataset.mealId;
    const index = Number(e.currentTarget.dataset.index);
    if (!mealId || !Number.isFinite(index)) return;
    const key = `formState.${mealId}.foodIndex`;

    const displayFoods = this.data.displayFoods || [];
    const food = displayFoods[index];

    // 默认重量记忆：带出当天该餐最近一次使用该食物的克数
    let lastGrams = "";
    if (food && this.data.logs && this.data.dateStr) {
      const logs = this.data.logs;
      const dayLog = getOrCreateDayLog(logs, this.data.dateStr);
      const meal = (dayLog.meals || []).find((m) => m.id === mealId);
      if (meal && Array.isArray(meal.entries)) {
        for (let i = meal.entries.length - 1; i >= 0; i--) {
          const en = meal.entries[i];
          if (en && en.foodId === food.id && en.grams) {
            lastGrams = String(en.grams);
            break;
          }
        }
      }
    }

    const next = {
      [key]: index,
      openFoodDropdownMealId: "",
    };
    if (lastGrams) {
      next[`formState.${mealId}.grams`] = lastGrams;
    }
    this.setData(next);
  },

  onGramsInput(e) {
    const mealId = e.currentTarget.dataset.mealId;
    const grams = e.detail.value;
    const key = `formState.${mealId}.grams`;
    this.setData({
      [key]: grams,
      openFoodDropdownMealId: "",
    });
  },

  onAddEntryTap(e) {
    const mealId = e.currentTarget.dataset.mealId;
    const form = this.data.formState[mealId] || { foodIndex: -1, grams: "" };
    const { displayFoods, logs, dateStr } = this.data;

    if (form.foodIndex < 0 || form.foodIndex >= displayFoods.length) {
      wx.showToast({ title: "请选择食物", icon: "none" });
      return;
    }
    const gramsNum = parseFloat(form.grams);
    if (!gramsNum || gramsNum <= 0) {
      wx.showToast({ title: "请输入重量（g）", icon: "none" });
      return;
    }

    const food = displayFoods[form.foodIndex];
    const dayLog = getOrCreateDayLog(logs, dateStr);
    const meal = dayLog.meals.find((m) => m.id === mealId);
    if (!meal) return;

    const macros = calcEntryMacros(food, gramsNum);
    meal.entries.push({
      id: `entry_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      foodId: food.id,
      grams: gramsNum,
      macros,
    });

    saveJSON(STORAGE_KEYS.LOGS, logs);
    this.bumpFoodUsage(food.id);

    const resetKey = `formState.${mealId}.grams`;
    this.setData(
      {
        logs,
        [resetKey]: "",
        openFoodDropdownMealId: "",
      },
      () => {
        this.updateMealsForToday(dayLog);
        this.scheduleAutoUploadKcal(dateStr, { reason: "addEntry" });
      }
    );
  },

  onDeleteEntryTap(e) {
    const mealId = e.currentTarget.dataset.mealId;
    const entryId = e.currentTarget.dataset.entryId;
    const { logs, dateStr } = this.data;

    const dayLog = getOrCreateDayLog(logs, dateStr);
    const meal = dayLog.meals.find((m) => m.id === mealId);
    if (!meal) return;

    meal.entries = (meal.entries || []).filter((en) => en.id !== entryId);

    saveJSON(STORAGE_KEYS.LOGS, logs);
    this.setData(
      {
        logs,
      },
      () => {
        this.updateMealsForToday(dayLog);
        this.scheduleAutoUploadKcal(dateStr, { reason: "deleteEntry" });
      }
    );
  },

  // ====== 食物库表单 ======
  onFoodNameInput(e) {
    this.setData({
      "foodForm.name": e.detail.value,
    });
  },

  onFoodProteinInput(e) {
    this.setData({
      "foodForm.protein": e.detail.value,
    });
  },

  onFoodCarbsInput(e) {
    this.setData({
      "foodForm.carbs": e.detail.value,
    });
  },

  onFoodFatInput(e) {
    this.setData({
      "foodForm.fat": e.detail.value,
    });
  },

  onSaveFoodTap() {
    const { name, protein, carbs, fat } = this.data.foodForm;
    const p = parseFloat(protein);
    const c = parseFloat(carbs);
    const f = parseFloat(fat);

    if (!name || !name.trim()) {
      wx.showToast({ title: "请输入食物名称", icon: "none" });
      return;
    }
    if ([p, c, f].some((v) => Number.isNaN(v) || v < 0)) {
      wx.showToast({ title: "请填写合法的营养数据", icon: "none" });
      return;
    }

    const foods = [...this.data.foods];
    foods.push({
      id: `user_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      name: name.trim(),
      proteinPer100g: p,
      carbsPer100g: c,
      fatPer100g: f,
      systemBuiltIn: false,
    });

    saveJSON(STORAGE_KEYS.FOODS, foods);

    this.setData(
      {
        foods: normalizeFoods(foods),
        foodForm: { name: "", protein: "", carbs: "", fat: "" },
      },
      () => {
        this.rebuildDisplayFoods();
        const logs = this.data.logs;
        const dayLog = getOrCreateDayLog(logs, this.data.dateStr);
        this.updateMealsForToday(dayLog);
        wx.showToast({ title: "已保存食物", icon: "success" });
      }
    );
  },
});
