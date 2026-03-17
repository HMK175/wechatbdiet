const { STORAGE_KEYS, loadJSON } = require("../../utils/storage");

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// 为力量行计算系数并格式化为显示用字符串（避免在 WXML 里调用 toFixed 导致不渲染）
function addCoefficient(rows) {
  const fmt = (v) => (v != null && v !== "" ? String(Number(v).toFixed(1)) : "-");
  return (rows || []).map((row) => {
    const bw = Number(row.bodyweight_kg) || 0;
    const total = Number(row.total_1rm) || 0;
    const coefficient = bw > 0 ? total / bw : 0;
    return {
      ...row,
      coefficient,
      bench_1rm_display: fmt(row.bench_1rm),
      deadlift_1rm_display: fmt(row.deadlift_1rm),
      squat_1rm_display: fmt(row.squat_1rm),
      coefficient_display: fmt(coefficient),
      bodyweight_kg_display: row.bodyweight_kg != null && row.bodyweight_kg !== "" ? String(row.bodyweight_kg) : "-",
    };
  });
}

// 排序：返回新数组，不修改原数组
function sortRows(rows, tab, sortKey, sortOrder) {
  const list = tab === "strength" ? addCoefficient(rows) : (rows || []).slice();
  const desc = sortOrder === "desc";
  const mult = desc ? -1 : 1;
  const num = (v) => (v == null || v === "" ? -1 : Number(v));
  list.sort((a, b) => {
    let va = a[sortKey];
    let vb = b[sortKey];
    if (sortKey === "coefficient") {
      va = a.coefficient;
      vb = b.coefficient;
    }
    if (sortKey === "bodyweight_kg") {
      va = a.bodyweight_kg;
      vb = b.bodyweight_kg;
    }
    const na = num(va);
    const nb = num(vb);
    if (na !== nb) return mult * (na - nb);
    return 0;
  });
  return list;
}

Page({
  data: {
    rankDate: todayStr(),
    rankTab: "kcal",
    rankRows: [],
    displayRows: [],
    sortKey: "kcal",
    sortOrder: "desc",
    rankLoading: false,
    rankError: "",
  },

  onLoad() {
    loadJSON(STORAGE_KEYS.SETTINGS, null);
    this.fetchRank();
  },

  onRankDateChange(e) {
    const date = e.detail.value;
    if (!date) return;
    this.setData({ rankDate: date }, () => this.fetchRank());
  },

  onRankTabTap(e) {
    const tab = e.currentTarget.dataset.tab === "strength" ? "strength" : "kcal";
    const sortKey = tab === "kcal" ? "kcal" : "coefficient";
    // 切换 tab 时重新拉取数据：kcal 受日期影响；力量榜不受日期影响但需要最新数据
    this.setData({ rankTab: tab, sortKey, sortOrder: "desc" }, () => this.fetchRank());
  },

  applySort() {
    const { rankRows, rankTab, sortKey, sortOrder } = this.data;
    const displayRows = sortRows(rankRows, rankTab, sortKey, sortOrder);
    this.setData({ displayRows });
  },

  onHeaderTap(e) {
    const key = e.currentTarget.dataset.key;
    if (!key) return;
    const { sortKey, sortOrder } = this.data;
    const nextOrder = sortKey === key && sortOrder === "desc" ? "asc" : "desc";
    this.setData({ sortKey: key, sortOrder: nextOrder }, () => this.applySort());
  },

  async fetchRank() {
    if (!wx.cloud) {
      this.setData({
        rankError: "当前小程序未开启云开发环境，排行榜功能暂不可用（不影响本地饮食记录）。",
        rankRows: [],
        displayRows: [],
      });
      wx.showToast({ title: "云开发未初始化，无法加载排行榜", icon: "none" });
      return;
    }

    this.setData({ rankLoading: true, rankError: "" });
    try {
      const res = await wx.cloud.callFunction({
        name: "rank",
        data:
          this.data.rankTab === "strength"
            ? { action: "get", type: "strength", date: this.data.rankDate }
            : { action: "get", type: "kcal", date: this.data.rankDate },
      });
      // 云函数返回在 res.result，可能为 { code: 0, data: [] } 或少数环境多一层 result
      const result = res.result != null ? res.result : (res.result === undefined ? res : null);
      let rawRows = [];
      if (Array.isArray(result)) {
        rawRows = result;
      } else if (result && typeof result === "object") {
        if (result.code !== 0 && result.code !== undefined) {
          this.setData({
            rankError: result.message || "加载失败",
            rankRows: [],
            displayRows: [],
          });
          return;
        }
        rawRows = Array.isArray(result.data) ? result.data : [];
        if (rawRows.length === 0 && result.result && Array.isArray(result.result)) {
          rawRows = result.result;
        }
      }
      // 规范化每条记录，确保字段在顶层且 _id 为字符串（便于 wx:key）
      const rows = rawRows.map((r) => {
        const data = r && r.data != null ? r.data : {};
        const flat = r && typeof r === "object" ? r : {};
        const id = flat._id != null ? String(flat._id) : (data._id != null ? String(data._id) : "");
        return {
          _id: id || `row_${Math.random().toString(36).slice(2)}`,
          _openid: flat._openid ?? data._openid,
          date: flat.date ?? data.date,
          bodyweight_kg: flat.bodyweight_kg ?? data.bodyweight_kg ?? null,
          kcal: flat.kcal ?? data.kcal ?? null,
          protein_g: flat.protein_g ?? data.protein_g ?? null,
          carbs_g: flat.carbs_g ?? data.carbs_g ?? null,
          fat_g: flat.fat_g ?? data.fat_g ?? null,
          bench_1rm: flat.bench_1rm ?? data.bench_1rm ?? null,
          deadlift_1rm: flat.deadlift_1rm ?? data.deadlift_1rm ?? null,
          squat_1rm: flat.squat_1rm ?? data.squat_1rm ?? null,
          total_1rm: flat.total_1rm ?? data.total_1rm ?? null,
          nickname: flat.nickname ?? data.nickname ?? null,
          avatarUrl: flat.avatarUrl ?? data.avatarUrl ?? null,
          updatedAt: flat.updatedAt ?? data.updatedAt,
        };
      });
      const displayRows = sortRows(rows, this.data.rankTab, this.data.sortKey, this.data.sortOrder);
      this.setData({ rankRows: rows, displayRows, rankError: "" });
    } catch (e) {
      console.error("fetchRank error:", e);
      this.setData({
        rankError: "加载排行榜失败，可能是网络问题或云环境不可用。稍后再试，期间不影响本地记录。",
        rankRows: [],
        displayRows: [],
      });
      wx.showToast({ title: "加载排行榜失败", icon: "none" });
    } finally {
      this.setData({ rankLoading: false });
    }
  },
});
