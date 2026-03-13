const cloud = require("wx-server-sdk");

cloud.init();

const db = cloud.database();
const COLLECTION = "leaderboard_daily";
const USERS = "users";

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const { action } = event || {};

  if (action === "get") {
    const date = event.date;
    if (!date) {
      return { code: 400, message: "date is required" };
    }
    const { data } = await db
      .collection(COLLECTION)
      .where({ date })
      .orderBy("updatedAt", "desc")
      .get();
    return { code: 0, data };
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

