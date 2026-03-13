const cloud = require("wx-server-sdk");

cloud.init();

const db = cloud.database();
const USERS = "users";

function clampText(s, maxLen) {
  const v = String(s || "").trim();
  if (!v) return "";
  return v.slice(0, maxLen);
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { action } = event || {};

  if (action === "get") {
    const { data } = await db
      .collection(USERS)
      .where({ _openid: openid })
      .limit(1)
      .get();
    const row = (data && data[0]) || null;
    return {
      code: 0,
      data: row
        ? {
            nickname: row.nickname || "",
            avatarUrl: row.avatarUrl || "",
            updatedAt: row.updatedAt || null,
          }
        : { nickname: "", avatarUrl: "", updatedAt: null },
    };
  }

  if (action === "set") {
    const nickname = clampText(event.nickname, 20);
    const avatarUrl = clampText(event.avatarUrl, 500);
    const now = new Date();

    const { data } = await db
      .collection(USERS)
      .where({ _openid: openid })
      .limit(1)
      .get();
    const row = (data && data[0]) || null;

    if (!row) {
      await db.collection(USERS).add({
        data: {
          _openid: openid,
          nickname,
          avatarUrl,
          updatedAt: now,
        },
      });
    } else {
      await db.collection(USERS).doc(row._id).update({
        data: {
          nickname,
          avatarUrl,
          updatedAt: now,
        },
      });
    }

    return { code: 0, data: { nickname, avatarUrl, updatedAt: now } };
  }

  return { code: 400, message: "unknown action" };
};

