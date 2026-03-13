const STORAGE_KEYS = {
  SETTINGS: "nutritionApp_settings",
  FOODS: "nutritionApp_foods",
  LOGS: "nutritionApp_logs",
  RANK_PROFILE: "nutritionApp_rankProfile",
  PROFILE: "nutritionApp_profile",
};

function loadJSON(key, defaultValue) {
  try {
    const raw = wx.getStorageSync(key);
    if (!raw) return defaultValue;
    return JSON.parse(raw);
  } catch (e) {
    console.warn("加载本地存储失败:", key, e);
    return defaultValue;
  }
}

function saveJSON(key, value) {
  try {
    wx.setStorageSync(key, JSON.stringify(value));
  } catch (e) {
    console.warn("保存本地存储失败:", key, e);
  }
}

module.exports = {
  STORAGE_KEYS,
  loadJSON,
  saveJSON,
};

