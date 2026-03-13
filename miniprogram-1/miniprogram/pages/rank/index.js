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
    rankError: "",
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
    if (!wx.cloud) {
      this.setData({
        rankError: "当前小程序未开启云开发环境，排行榜功能暂不可用（不影响本地饮食记录）。",
        rankRows: [],
      });
      wx.showToast({ title: "云开发未初始化，无法加载排行榜", icon: "none" });
      return;
    }

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
      this.setData({ rankRows: rows, rankError: "" });
    } catch (e) {
      console.error("fetchRank error:", e);
      this.setData({
        rankError: "加载排行榜失败，可能是网络问题或云环境不可用。稍后再试，期间不影响本地记录。",
      });
      wx.showToast({ title: "加载排行榜失败", icon: "none" });
    } finally {
      this.setData({ rankLoading: false });
    }
  },
});

