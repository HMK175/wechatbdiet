const { STORAGE_KEYS, loadJSON } = require("../../utils/storage");

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

Page({
  data: {
    rankDate: todayStr(),
    rankTab: "kcal",
    rankRows: [],
    rankLoading: false,
  },

  onLoad() {
    loadJSON(STORAGE_KEYS.SETTINGS, null); // 触发本地初始化，避免旧版本没建 key
    this.fetchRank();
  },

  onRankDateChange(e) {
    const date = e.detail.value;
    if (!date) return;
    this.setData(
      {
        rankDate: date,
      },
      () => {
        this.fetchRank();
      }
    );
  },

  onRankTabTap(e) {
    const tab = e.currentTarget.dataset.tab === "strength" ? "strength" : "kcal";
    this.setData({ rankTab: tab });
  },

  async fetchRank() {
    this.setData({ rankLoading: true });
    try {
      const res = await wx.cloud.callFunction({
        name: "rank",
        data: {
          action: "get",
          date: this.data.rankDate,
        },
      });
      const rows = (res.result && res.result.data) || [];
      this.setData({ rankRows: rows });
    } catch (e) {
      console.error("fetchRank error:", e);
      wx.showToast({ title: "加载排行榜失败", icon: "none" });
    } finally {
      this.setData({ rankLoading: false });
    }
  },
});

