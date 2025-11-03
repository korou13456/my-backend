const db = require("../../config/database");

// 解析participants字段（支持字符串JSON和数组格式）
const parseParticipants = (participants) => {
  if (!participants) return [];
  if (typeof participants === "string") {
    try {
      participants = JSON.parse(participants);
    } catch (e) {
      console.error("解析participants失败:", e);
      return [];
    }
  }
  return Array.isArray(participants) ? participants : [];
};

// 从participants数组中提取有效的用户ID
const extractUserIds = (participants) => {
  return participants
    .map((id) => Number(id))
    .filter((id) => !isNaN(id) && id > 0);
};

const getTableList = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // 1. 先查询所有需要更新的过期房间
    const findExpiredSql = `
      SELECT id, participants 
      FROM table_list 
      WHERE status = 0 
        AND (start_time < NOW() OR TIMESTAMPDIFF(HOUR, create_time, NOW()) > 2)
    `;

    const [expiredRooms] = await connection.execute(findExpiredSql);

    // 2. 批量更新这些房间状态为已取消
    if (expiredRooms.length > 0) {
      const expiredRoomIds = expiredRooms.map((room) => room.id);
      const placeholders = expiredRoomIds.map(() => "?").join(",");

      await connection.execute(
        `UPDATE table_list SET status = 3 WHERE id IN (${placeholders})`,
        expiredRoomIds
      );

      // 3. 批量更新这些房间内用户的状态
      const allUserIds = [];
      expiredRooms.forEach((room) => {
        const participants = parseParticipants(room.participants);
        const validUserIds = extractUserIds(participants);
        allUserIds.push(...validUserIds);
      });

      if (allUserIds.length > 0) {
        const uniqueUserIds = [...new Set(allUserIds)];
        const userPlaceholders = uniqueUserIds.map(() => "?").join(",");

        await connection.execute(
          `UPDATE users SET status = 0, enter_room_id = NULL 
           WHERE id IN (${userPlaceholders})`,
          uniqueUserIds
        );
      }
    }

    // 4. 查询有效的房间列表
    const selectSql = `
      SELECT 
        id,
        host_id as hostId,
        participants,
        pay_type as payType,
        scoring_tier as scoringTier,
        special_notes as specialNotes,
        start_time as startTime,
        store_id as storeId,
        duration,
        mahjong_type as mahjongType,
        gender_pref as genderPref,
        status,
        create_time as createTime
      FROM \`table_list\` 
      WHERE status = 0 
        AND TIMESTAMPDIFF(HOUR, create_time, NOW()) <= 2
        AND start_time >= NOW()
      ORDER BY create_time DESC
    `;

    const [results] = await connection.execute(selectSql);

    // 5. 处理用户信息（原有逻辑）
    const userIds = new Set();
    const parsedParticipantsMap = new Map();

    results.forEach((row, index) => {
      const participants = parseParticipants(row.participants);
      const validUserIds = extractUserIds(participants);
      parsedParticipantsMap.set(index, validUserIds);
      validUserIds.forEach((id) => userIds.add(id));
    });

    const userMap = {};
    if (userIds.size > 0) {
      const userIdArray = Array.from(userIds);
      const placeholders = userIdArray.map(() => "?").join(",");
      const userSql = `
        SELECT 
          id,
          wxid,
          nickname,
          avatar_url as avatarUrl,
          gender,
          phone_num as phoneNum
        FROM \`users\`
        WHERE id IN (${placeholders})
      `;
      const [userResults] = await connection.execute(userSql, userIdArray);

      userResults.forEach((user) => {
        userMap[user.id] = user;
      });
    }

    const processedResults = results.map((row, index) => {
      const userIds = parsedParticipantsMap.get(index) || [];
      row.participants = userIds
        .map((userId) => userMap[userId])
        .filter((user) => user !== undefined);
      return row;
    });

    await connection.commit();

    res.json({
      code: 200,
      message: "success",
      list: processedResults,
    });
  } catch (error) {
    await connection.rollback();
    console.error("获取房间列表失败:", error);
    res.status(500).json({
      code: 500,
      message: "获取房间列表失败",
      error: error.message,
    });
  } finally {
    connection.release();
  }
};

module.exports = getTableList;
