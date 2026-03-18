const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const COLLECTION = "leaderboard_daily";
const STRENGTH_LATEST = "leaderboard_strength_latest";
const USERS = "users";

async function attachAvatarTempUrls(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const fileIDs = Array.from(
    new Set(
      list
        .map((r) => (r && r.avatarUrl ? String(r.avatarUrl) : ""))
        .filter((u) => u && u.startsWith("cloud://"))
    )
  );
  if (!fileIDs.length) return list;

  try {
    const res = await cloud.getTempFileURL({ fileList: fileIDs });
    const tempList = (res && res.fileList) || [];
    const map = new Map();
    tempList.forEach((it) => {
      if (it && it.fileID && it.tempFileURL) {
        map.set(String(it.fileID), String(it.tempFileURL));
      }
    });
    return list.map((r) => {
      const u = r && r.avatarUrl ? String(r.avatarUrl) : "";
      if (u && u.startsWith("cloud://") && map.has(u)) {
        return { ...r, avatarUrl: map.get(u) };
      }
      return r;
    });
  } catch (e) {
    // 获取临时链接失败则原样返回（不影响其它字段）
    return list;
  }
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const { action } = event || {};

  if (action === "get") {
    const type = event.type === "strength" ? "strength" : "kcal";
    let date = event.date;
    if (type === "kcal" && !date) {
      return { code: 400, message: "date is required" };
    }
    if (type === "kcal") {
      // 统一为 YYYY-MM-DD，避免与库里格式不一致查不到
      if (typeof date === "string" && date.length >= 10) {
        date = date.slice(0, 10);
      } else {
        date = String(date);
      }
    }
    let rawList = [];
    if (type === "kcal") {
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
          const res = await db.collection(COLLECTION).limit(200).get();
          const list = res.data || [];
          rawList = list.filter((doc) => {
            const d = doc.data && doc.data.date != null ? doc.data.date : doc.date;
            return d != null && String(d).slice(0, 10) === date;
          });
        } catch (e) {
          // 忽略
        }
      }
    } else {
      // 力量榜：不与日期关联。
      // 优先使用“每用户一条”的最新集合，避免全表扫描/limit 截断导致排行榜抖动。
      let list = [];
      try {
        const res = await db.collection(STRENGTH_LATEST).orderBy("updatedAt", "desc").limit(500).get();
        list = res.data || [];
      } catch (e) {
        list = [];
      }

      if (list.length === 0) {
        // 兼容旧数据：从 daily 集合按 updatedAt desc 拉取一小段，按 openid 去重（避免扫全表）
        let recent = [];
        try {
          const res = await db.collection(COLLECTION).orderBy("updatedAt", "desc").limit(800).get();
          recent = res.data || [];
        } catch (e) {
          const res = await db.collection(COLLECTION).limit(800).get();
          recent = res.data || [];
        }
        const latestByOpenid = new Map();
        recent.forEach((doc) => {
          const fields = doc.data != null ? doc.data : doc;
          const openid = fields._openid || doc._openid;
          if (!openid) return;
          if (!latestByOpenid.has(openid)) latestByOpenid.set(openid, doc);
        });
        rawList = Array.from(latestByOpenid.values());
      } else {
        rawList = list;
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
    const withAvatars = await attachAvatarTempUrls(flattened);
    return { code: 0, data: withAvatars };
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
          // 同时写入顶层字段与 data 字段，兼容旧结构 & 便于 orderBy/where 查询
          ...payload,
          data: payload,
        });
    } catch (e) {
      // 如果 doc 已存在，改用 update
      if (e.errCode === 6 || /document exists/i.test(e.errMsg || "")) {
        await db
          .collection(COLLECTION)
          .doc(docId)
          .update({
            ...payload,
            data: payload,
          });
      } else {
        throw e;
      }
    }

    // 同步写入“最新力量”集合（每用户一条），供力量榜读取
    // 仅当三大项至少有一项有值时写入，避免被仅 kcal 上传覆盖掉力量
    if ((Number(bench_1rm) || 0) > 0 || (Number(deadlift_1rm) || 0) > 0 || (Number(squat_1rm) || 0) > 0) {
      const strengthDocId = `${openid}`;
      try {
        await db.collection(STRENGTH_LATEST).doc(strengthDocId).set({ data: { ...payload } });
      } catch (e) {
        if (e.errCode === 6 || /document exists/i.test(e.errMsg || "")) {
          await db.collection(STRENGTH_LATEST).doc(strengthDocId).update({ data: { ...payload } });
        } else {
          // ignore
        }
      }
    }

    return { code: 0, data: payload };
  }

  return { code: 400, message: "unknown action" };
};

