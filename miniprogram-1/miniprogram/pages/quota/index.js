const { QUOTA_DIMENSIONS, getQuotaExact, defaultFatGrams } = require("../../utils/quota");
const { STORAGE_KEYS, loadJSON, saveJSON } = require("../../utils/storage");

Page({
  data: {
    gender: "male",
    phase: "bulk",
    heights: [],
    rows: [],
  },

  onLoad() {
    const settings = loadJSON(STORAGE_KEYS.SETTINGS, null) || {};
    const gender = settings.gender === "female" ? "female" : "male";
    const phase = settings.phase === "cut" ? "cut" : "bulk";
    this.setData(
      {
        gender,
        phase,
      },
      () => {
        this.buildTable();
      }
    );
  },

  buildTable() {
    const { gender, phase } = this.data;
    const dims = QUOTA_DIMENSIONS[gender]?.[phase];
    if (!dims) {
      this.setData({ heights: [], rows: [] });
      return;
    }
    const heights = dims.heights;
    const rows = dims.weights.map((w) => {
      const cells = heights.map((h) => {
        const v = getQuotaExact(gender, phase, w, h);
        if (!v) {
          return { height: h, value: null, text: "" };
        }
        const text = `${v.carbsTrainingPerKg}/${v.carbsRestPerKg}/${v.proteinPerKg}`;
        return { height: h, value: v, text };
      });
      return { weight: w, cells };
    });
    this.setData({ heights, rows });
  },

  onGenderTap(e) {
    const gender = e.currentTarget.dataset.gender === "female" ? "female" : "male";
    if (gender === this.data.gender) return;
    this.setData({ gender }, () => this.buildTable());
  },

  onPhaseTap(e) {
    const phase = e.currentTarget.dataset.phase === "cut" ? "cut" : "bulk";
    if (phase === this.data.phase) return;
    this.setData({ phase }, () => this.buildTable());
  },

  onCellTap(e) {
    const weight = Number(e.currentTarget.dataset.weight);
    const height = Number(e.currentTarget.dataset.height);
    const { gender, phase } = this.data;
    const v = getQuotaExact(gender, phase, weight, height);
    if (!v) return;

    const stored = loadJSON(STORAGE_KEYS.SETTINGS, null) || {};
    const next = {
      ...stored,
      gender,
      phase,
      heightCm: height,
      weightKg: weight,
      proteinPerKg: v.proteinPerKg,
      carbsTrainingPerKg: v.carbsTrainingPerKg,
      carbsRestPerKg: v.carbsRestPerKg,
      fatGrams: defaultFatGrams(gender, phase),
    };
    saveJSON(STORAGE_KEYS.SETTINGS, next);
    wx.showToast({
      title: "已写入基础配置",
      icon: "success",
    });
    setTimeout(() => {
      wx.navigateBack();
    }, 400);
  },
});

