const { STORAGE_KEYS, loadJSON, saveJSON } = require("../../utils/storage");

Page({
  data: {
    nickname: "",
    avatarUrl: "",
    defaultAvatar: "data:image/svg+xml;utf8," + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="100%" height="100%" fill="#eef2ff"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#2f80ed" font-size="28">头像</text></svg>`
    ),
  },

  onLoad() {
    const openid = wx.getStorageSync("openid");
    if (!openid) {
      wx.showToast({ title: "请先在首页登录", icon: "none" });
      return;
    }
    const local = loadJSON(STORAGE_KEYS.PROFILE, null);
    if (local && typeof local === "object") {
      this.setData({
        nickname: local.nickname || "",
        avatarUrl: local.avatarUrl || "",
      });
    }
    this.fetchProfile();
  },

  async fetchProfile() {
    try {
      const res = await wx.cloud.callFunction({
        name: "profile",
        data: { action: "get" },
      });
      const p = (res.result && res.result.data) || {};
      this.setData({
        nickname: p.nickname || this.data.nickname,
        avatarUrl: p.avatarUrl || this.data.avatarUrl,
      });
      saveJSON(STORAGE_KEYS.PROFILE, { nickname: this.data.nickname, avatarUrl: this.data.avatarUrl });
    } catch (e) {
      console.warn("fetchProfile failed", e);
    }
  },

  onNicknameInput(e) {
    this.setData({ nickname: e.detail.value });
  },

  async onChooseAvatar() {
    try {
      const res = await wx.chooseMedia({
        count: 1,
        mediaType: ["image"],
        sizeType: ["compressed"],
      });
      const file = res && res.tempFiles && res.tempFiles[0];
      const path = file && file.tempFilePath;
      if (!path) return;

      wx.showLoading({ title: "上传头像...", mask: true });
      const openid = wx.getStorageSync("openid");
      const ext = (path.split(".").pop() || "jpg").toLowerCase();
      const cloudPath = `avatars/${openid}_${Date.now()}.${ext}`;
      const up = await wx.cloud.uploadFile({ cloudPath, filePath: path });
      const fileID = up && up.fileID;
      if (!fileID) throw new Error("上传失败");

      this.setData({ avatarUrl: fileID });
      saveJSON(STORAGE_KEYS.PROFILE, { nickname: this.data.nickname, avatarUrl: this.data.avatarUrl });
    } catch (e) {
      console.error("choose/upload avatar failed", e);
      wx.showToast({ title: "头像上传失败", icon: "none" });
    } finally {
      wx.hideLoading();
    }
  },

  async onSave() {
    const openid = wx.getStorageSync("openid");
    if (!openid) {
      wx.showToast({ title: "请先在首页登录", icon: "none" });
      return;
    }
    const nickname = String(this.data.nickname || "").trim();
    if (!nickname) {
      wx.showToast({ title: "请输入昵称", icon: "none" });
      return;
    }
    try {
      wx.showLoading({ title: "保存中...", mask: true });
      await wx.cloud.callFunction({
        name: "profile",
        data: { action: "set", nickname, avatarUrl: this.data.avatarUrl || "" },
      });
      saveJSON(STORAGE_KEYS.PROFILE, { nickname, avatarUrl: this.data.avatarUrl || "" });
      wx.showToast({ title: "已保存", icon: "success" });
    } catch (e) {
      console.error("save profile failed", e);
      // 云端保存失败时，至少保证本地可用，避免完全无反馈
      saveJSON(STORAGE_KEYS.PROFILE, { nickname, avatarUrl: this.data.avatarUrl || "" });
      wx.showToast({ title: "云端保存失败，已保存到本地", icon: "none" });
    } finally {
      wx.hideLoading();
    }
  },
});

