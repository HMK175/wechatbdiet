const { STORAGE_KEYS, loadJSON, saveJSON } = require("../../utils/storage");

const BUILT_IN_FOODS = [
  { id: "egg", name: "鸡蛋", proteinPer100g: 13, carbsPer100g: 1.3, fatPer100g: 11, systemBuiltIn: true },
  { id: "chicken_leg", name: "鸡腿", proteinPer100g: 18, carbsPer100g: 0, fatPer100g: 8, systemBuiltIn: true },
  { id: "duck_leg", name: "鸭腿", proteinPer100g: 17, carbsPer100g: 0, fatPer100g: 12, systemBuiltIn: true },
  { id: "rice_cooked", name: "米饭（熟）", proteinPer100g: 2.6, carbsPer100g: 28, fatPer100g: 0.3, systemBuiltIn: true },
];

function normalizeFoods(foods) {
  const safe = Array.isArray(foods) ? foods : [];
  const userFoods = safe.filter((f) => f && f.id && !f.systemBuiltIn);
  const normalizedBuiltIns = BUILT_IN_FOODS.map((bf) => ({ ...bf, systemBuiltIn: true }));
  return [...normalizedBuiltIns, ...userFoods];
}

Page({
  data: {
    foods: [],
    foodForm: {
      name: "",
      protein: "",
      carbs: "",
      fat: "",
    },
  },

  onLoad() {
    this.loadFoods();
  },

  loadFoods() {
    const storedFoods = loadJSON(STORAGE_KEYS.FOODS, null);
    const foods = normalizeFoods(storedFoods && Array.isArray(storedFoods) ? storedFoods : []);
    saveJSON(STORAGE_KEYS.FOODS, foods);
    this.setData({ foods });
  },

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

    const foods = normalizeFoods(loadJSON(STORAGE_KEYS.FOODS, []) || []);
    foods.push({
      id: `user_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      name: name.trim(),
      proteinPer100g: p,
      carbsPer100g: c,
      fatPer100g: f,
      systemBuiltIn: false,
    });

    saveJSON(STORAGE_KEYS.FOODS, foods);
    this.setData({
      foods,
      foodForm: { name: "", protein: "", carbs: "", fat: "" },
    });
    wx.showToast({ title: "已保存食物", icon: "success" });
  },

  onDeleteFoodTap(e) {
    const id = e.currentTarget.dataset.id;
    const foods = this.data.foods.filter((f) => f.id !== id || f.systemBuiltIn);
    saveJSON(STORAGE_KEYS.FOODS, foods);
    this.setData({ foods });
  },
});

