const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const COLLECTION = "leaderboard_daily";
const USERS = "users";

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const { action } = event || {};

  if (action === "get") {
    let date = event.date;
    if (!date) {
      return { code: 400, message: "date is required" };
    }
    // 统一为 YYYY-MM-DD，避免与库里格式不一致查不到
    if (typeof date === "string" && date.length >= 10) {
      date = date.slice(0, 10);
    } else {
      date = String(date);
    }
    let rawList = [];
    try {
      const res = await db
        .collection(COLLECTION)
        .where({ "data.date": date })
        .get();
      rawList = res.data || [];
    } catch (e) {
      // 忽略嵌套查询错误，尝试扁平结构
    }
    if (rawList.length === 0) {
      try {
        const res = await db
          .collection(COLLECTION)
          .where({ date })
          .get();
        rawList = res.data || [];
      } catch (e) {
        // 忽略
      }
    }
    // 若仍为空，尝试拉取近期文档再按 date 过滤（兼容存储结构差异）
    if (rawList.length === 0) {
      try {
        const res = await db.collection(COLLECTION).limit(100).get();
        const list = res.data || [];
        rawList = list.filter((doc) => {
          const d = doc.data && doc.data.date != null ? doc.data.date : doc.date;
          return d != null && String(d).slice(0, 10) === date;
        });
      } catch (e) {
        // 忽略
      }
    }
    // 扁平化：云文档可能是 { _id, data: { ... } } 或顶层即字段，统一成 { _id, ...fields }
    const flattened = (rawList || []).map((doc) => {
      const fields = doc.data != null ? doc.data : doc;
      const out = { _id: doc._id, ...fields };
      return out;
    });
    flattened.sort((a, b) => {
      const toTime = (v) => {
        if (v == null) return 0;
        if (typeof v.getTime === "function") return v.getTime();
        if (typeof v === "number") return v;
        const t = new Date(v).getTime();
        return Number.isNaN(t) ? 0 : t;
      };
      return toTime(b.updatedAt) - toTime(a.updatedAt);
    });
    return { code: 0, data: flattened };
  }

  if (action === "upload") {
    const {
      date,
      bodyweight_kg,
      kcal,
      protein_g,
      carbs_g,
      fat_g,
      bench_1rm,
      deadlift_1rm,
      squat_1rm,
    } = event.payload || {};

    if (!date) {
      return { code: 400, message: "date is required" };
    }
    if (!bodyweight_kg || bodyweight_kg <= 0) {
      return { code: 400, message: "invalid bodyweight" };
    }

    const openid = wxContext.OPENID;
    const now = new Date();
    const total_1rm =
      (Number(bench_1rm) || 0) + (Number(deadlift_1rm) || 0) + (Number(squat_1rm) || 0);

    // 读取用户昵称/头像（用于排行榜展示）
    let nickname = "";
    let avatarUrl = "";
    try {
      const { data } = await db.collection(USERS).where({ _openid: openid }).limit(1).get();
      const u = (data && data[0]) || null;
      nickname = (u && u.nickname) || "";
      avatarUrl = (u && u.avatarUrl) || "";
    } catch (e) {
      // ignore
    }

    const docId = `${openid}_${date}`;
    const payload = {
      _openid: openid,
      date,
      bodyweight_kg,
      kcal,
      protein_g,
      carbs_g,
      fat_g,
      nickname: nickname || null,
      avatarUrl: avatarUrl || null,
      bench_1rm: bench_1rm || null,
      deadlift_1rm: deadlift_1rm || null,
      squat_1rm: squat_1rm || null,
      total_1rm: total_1rm || null,
      updatedAt: now,
    };

    try {
      await db
        .collection(COLLECTION)
        .doc(docId)
        .set({
          data: payload,
        });
    } catch (e) {
      // 如果 doc 已存在，改用 update
      if (e.errCode === 6 || /document exists/i.test(e.errMsg || "")) {
        await db
          .collection(COLLECTION)
          .doc(docId)
          .update({
            data: payload,
          });
      } else {
        throw e;
      }
    }

    return { code: 0, data: payload };
  }

  return { code: 400, message: "unknown action" };
};

