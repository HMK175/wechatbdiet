// app.js
App({
  onLaunch() {
    this.globalData = {
      // env 参数说明：
      // env 参数决定接下来小程序发起的云开发调用（wx.cloud.xxx）会请求到哪个云环境的资源
      // 请在这里填入你在云开发控制台创建的环境 ID，例如 "prod-xxxxx"
      env: "cloud1-2gl904zq714e488e",
      openid: null,
      userInfo: null,
    };

    if (!wx.cloud) {
      console.error("请使用 2.2.3 或以上的基础库以使用云能力");
      return;
    }

    wx.cloud.init({
      env: this.globalData.env,
      traceUser: true,
    });
  },
});
