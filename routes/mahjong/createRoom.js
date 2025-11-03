const db = require("../../config/database");

// 加入房间/切换房间
const createRoom = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const { userId, tableId, currentTableId } = req.body;

    if (!userId || !tableId) {
      return res.status(400).json({
        success: false,
        message: "缺少必要参数：userId 和 tableId",
      });
    }

    // 1. 如果用户当前在房间中，先退出
    if (currentTableId) {
      const [currentTables] = await connection.execute(
        "SELECT participants FROM `table_list` WHERE id = ?",
        [currentTableId]
      );

      if (currentTables.length > 0) {
        const currentTable = currentTables[0];
        let currentParticipants = [];

        if (currentTable.participants) {
          currentParticipants =
            typeof currentTable.participants === "string"
              ? JSON.parse(currentTable.participants)
              : currentTable.participants;
        }

        // 从当前房间移除用户
        const userIndex = currentParticipants.indexOf(parseInt(userId));
        if (userIndex !== -1) {
          currentParticipants.splice(userIndex, 1);
          await connection.execute(
            "UPDATE `table_list` SET participants = ? WHERE id = ?",
            [JSON.stringify(currentParticipants), currentTableId]
          );
        }
      }
    }

    // 2. 加入目标房间
    const [targetTables] = await connection.execute(
      "SELECT participants FROM `table_list` WHERE id = ?",
      [tableId]
    );

    if (targetTables.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: "目标房间不存在",
      });
    }

    const targetTable = targetTables[0];
    let targetParticipants = [];

    if (targetTable.participants) {
      targetParticipants =
        typeof targetTable.participants === "string"
          ? JSON.parse(targetTable.participants)
          : targetTable.participants;
    }

    // 检查是否已在目标房间
    if (targetParticipants.includes(parseInt(userId))) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "您已经在该房间中",
      });
    }

    // 检查目标房间是否满员
    if (targetParticipants.length >= 4) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "目标房间已满员（最多4人），无法加入",
      });
    }

    targetParticipants.push(parseInt(userId));
    await connection.execute(
      "UPDATE `table_list` SET participants = ? WHERE id = ?",
      [JSON.stringify(targetParticipants), tableId]
    );

    // 3. 更新用户状态
    await connection.execute(
      "UPDATE users SET status = 1, enter_room_id = ? WHERE user_id = ?",
      [tableId, userId]
    );

    await connection.commit();

    res.json({
      success: true,
      message: currentTableId ? "成功切换房间" : "成功加入房间",
    });
  } catch (error) {
    await connection.rollback();
    console.error("切换房间错误:", error);
    res.status(500).json({
      success: false,
      message: "切换房间失败",
      error: error.message,
    });
  } finally {
    connection.release();
  }
};

module.exports = createRoom;
