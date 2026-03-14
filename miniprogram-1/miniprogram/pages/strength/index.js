const { STORAGE_KEYS, loadJSON, saveJSON } = require("../../utils/storage");

const DEFAULT_FORM = {
  bench: { direct1rm: "", weight: "", reps: "" },
  deadlift: { direct1rm: "", weight: "", reps: "" },
  squat: { direct1rm: "", weight: "", reps: "" },
};

const BUILT_IN_FOODS = [
  { id: "egg", name: "鸡蛋", proteinPer100g: 13, carbsPer100g: 1.3, fatPer100g: 11, systemBuiltIn: true },
  { id: "chicken_leg", name: "鸡腿", proteinPer100g: 18, carbsPer100g: 0, fatPer100g: 8, systemBuiltIn: true },
  { id: "duck_leg", name: "鸭腿", proteinPer100g: 17, carbsPer100g: 0, fatPer100g: 12, systemBuiltIn: true },
  { id: "rice_cooked", name: "米饭（熟）", proteinPer100g: 2.6, carbsPer100g: 28, fatPer100g: 0.3, systemBuiltIn: true },
];

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

Page({
  data: {
    dateStr: todayStr(),
    form: null,
    preview: {
      bench1rm: "",
      deadlift1rm: "",
      squat1rm: "",
    },
    settings: loadJSON(STORAGE_KEYS.SETTINGS, {}) || {},
    foods: normalizeFoods(loadJSON(STORAGE_KEYS.FOODS, []) || []),
    logs: loadJSON(STORAGE_KEYS.LOGS, {}) || {},
  },

  onLoad(query) {
    const dateStr = (query && query.date) || this.data.dateStr;
    const stored = loadJSON(STORAGE_KEYS.RANK_PROFILE, DEFAULT_FORM) || DEFAULT_FORM;
    // 兼容旧结构（有 sets/rir 的版本）
    const safe = {
      bench: { direct1rm: stored.bench?.direct1rm || "", weight: stored.bench?.weight || "", reps: stored.bench?.reps || "" },
      deadlift: { direct1rm: stored.deadlift?.direct1rm || "", weight: stored.deadlift?.weight || "", reps: stored.deadlift?.reps || "" },
      squat: { direct1rm: stored.squat?.direct1rm || "", weight: stored.squat?.weight || "", reps: stored.squat?.reps || "" },
    };
    this.setData({ dateStr, form: safe }, () => this.updatePreview());
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    if (!field) return;
    const v = e.detail.value;
    this.setData({ [`form.${field}`]: v }, () => this.updatePreview());
  },

  estimate1RM(weightKg, reps) {
    const w = Number(weightKg);
    const r0 = Number(reps);
    if (!w || w <= 0 || !r0 || r0 <= 0) return null;
    const rr = Math.max(1, Math.min(10, Math.round(r0)));
    if (rr <= 6) return w * (36 / (37 - rr)); // Brzycki
    return w * (1 + rr / 30); // Epley
  },

  pickLift1RM(lift) {
    const direct = parseFloat(lift && lift.direct1rm);
    if (Number.isFinite(direct) && direct > 0) return direct;
    const est = this.estimate1RM(lift && lift.weight, lift && lift.reps);
    return est && est > 0 ? est : null;
  },

  updatePreview() {
    const { form } = this.data;
    const b = this.pickLift1RM(form.bench);
    const d = this.pickLift1RM(form.deadlift);
    const s = this.pickLift1RM(form.squat);
    this.setData({
      preview: {
        bench1rm: b ? b.toFixed(1) + " kg" : "",
        deadlift1rm: d ? d.toFixed(1) + " kg" : "",
        squat1rm: s ? s.toFixed(1) + " kg" : "",
      },
    });
  },

  onSaveLocal() {
    saveJSON(STORAGE_KEYS.RANK_PROFILE, this.data.form);
    wx.showToast({ title: "已保存到本地", icon: "success" });
  },

  async onUpload() {
    const openid = wx.getStorageSync("openid");
    if (!openid) {
      wx.showToast({ title: "请先在首页登录", icon: "none" });
      return;
    }

    const bw = Number((this.data.settings || {}).weightKg);
    if (!bw || bw <= 0) {
      wx.showToast({ title: "请先在首页填写体重并保存配置", icon: "none" });
      return;
    }

    const dayLog = getOrCreateDayLog(this.data.logs, this.data.dateStr);
    const totals = calcDayTotals(dayLog, this.data.foods);
    const kcal =
      (Number(totals.protein) || 0) * 4 +
      (Number(totals.carbs) || 0) * 4 +
      (Number(totals.fat) || 0) * 9;

    const bench1rm = this.pickLift1RM(this.data.form.bench);
    const deadlift1rm = this.pickLift1RM(this.data.form.deadlift);
    const squat1rm = this.pickLift1RM(this.data.form.squat);

    const payload = {
      date: this.data.dateStr,
      bodyweight_kg: bw,
      kcal: Math.round(kcal),
      protein_g: Number(totals.protein.toFixed(1)),
      carbs_g: Number(totals.carbs.toFixed(1)),
      fat_g: Number(totals.fat.toFixed(1)),
      bench_1rm: bench1rm,
      deadlift_1rm: deadlift1rm,
      squat_1rm: squat1rm,
    };

    let loadingShown = false;
    try {
      wx.showLoading({ title: "上传中...", mask: true });
      loadingShown = true;
      await wx.cloud.callFunction({
        name: "rank",
        data: { action: "upload", payload },
      });
      saveJSON(STORAGE_KEYS.RANK_PROFILE, this.data.form);
      wx.showToast({ title: "已更新榜单", icon: "success" });
    } catch (e) {
      console.error("strength upload error", e);
      wx.showToast({ title: "上传失败", icon: "none" });
    } finally {
      if (loadingShown && typeof wx.hideLoading === "function") {
        wx.hideLoading();
      }
    }
  },
});

