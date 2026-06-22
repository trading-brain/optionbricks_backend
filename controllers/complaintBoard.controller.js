// controllers/complaintBoard.controller.js
const ComplaintBoard = require("../models/ComplaintBoard");

const BOARD_TYPES = ComplaintBoard.BOARD_TYPES; // ["complaint","monthly","annual"]

// Sanitize rows based on board type so we never store stray fields and always
// coerce numbers. Field names match the OptionBricks frontend tables.
function cleanComplaintRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((r, i) => ({
    srNo: r.srNo ?? i + 1,
    receivedFrom: String(r.receivedFrom ?? ""),
    pendingAtEndOfLastMonth: Number(r.pendingAtEndOfLastMonth) || 0,
    received: Number(r.received) || 0,
    receivedStar: Number(r.receivedStar) || 0,
    totalPending: Number(r.totalPending) || 0,
    pendingComplaintOver3Months: Number(r.pendingComplaintOver3Months) || 0,
    avgResolutionTime: String(r.avgResolutionTime ?? "N/A"),
  }));
}

function cleanMonthlyRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((r, i) => ({
    srNo: r.srNo ?? i + 1,
    month: String(r.month ?? ""),
    carriedForwardFromPreviousMonth: Number(r.carriedForwardFromPreviousMonth) || 0,
    received: Number(r.received) || 0,
    receivedStar: Number(r.receivedStar) || 0,
    pending: Number(r.pending) || 0,
  }));
}

function cleanAnnualRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((r, i) => ({
    srNo: r.srNo ?? i + 1,
    year: String(r.year ?? ""),
    carriedForwardFromPreviousMonth: Number(r.carriedForwardFromPreviousMonth) || 0,
    received: Number(r.received) || 0,
    receivedStar: Number(r.receivedStar) || 0,
    pending: Number(r.pending) || 0,
  }));
}

function cleanRows(boardType, rows) {
  if (boardType === "complaint") return cleanComplaintRows(rows);
  if (boardType === "monthly") return cleanMonthlyRows(rows);
  return cleanAnnualRows(rows);
}

// GET /api/complaint-board  → current version of all three tables (public site).
// Returns { complaint, monthly, annual } where each is the current doc or null.
async function getCurrentBoard(_req, res) {
  try {
    const docs = await Promise.all(
      BOARD_TYPES.map(async (boardType) => {
        const current =
          (await ComplaintBoard.findOne({ boardType, isCurrent: true }).sort({ version: -1 })) ||
          (await ComplaintBoard.findOne({ boardType }).sort({ version: -1 }));
        return [boardType, current];
      })
    );

    const data = {};
    docs.forEach(([boardType, doc]) => {
      data[boardType] = doc;
    });

    return res.status(200).json({ ok: true, data });
  } catch (err) {
    console.error("❌ getCurrentBoard error:", err);
    return res.status(500).json({ ok: false, message: "Failed to fetch complaint board" });
  }
}

// GET /api/complaint-board/history?type=monthly&page=&limit=  → versions of ONE table
async function getHistory(req, res) {
  try {
    const boardType = String(req.query.type || "");
    if (!BOARD_TYPES.includes(boardType)) {
      return res.status(400).json({ ok: false, message: "Invalid or missing ?type" });
    }

    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.max(Number(req.query.limit) || 50, 1);
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      ComplaintBoard.find({ boardType }).sort({ version: -1 }).skip(skip).limit(limit),
      ComplaintBoard.countDocuments({ boardType }),
    ]);

    return res.status(200).json({
      ok: true,
      type: boardType,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
      data,
    });
  } catch (err) {
    console.error("❌ getHistory error:", err);
    return res.status(500).json({ ok: false, message: "Failed to fetch history" });
  }
}

// GET /api/complaint-board/:id  → a specific version (panel view)
async function getBoardById(req, res) {
  try {
    const board = await ComplaintBoard.findById(req.params.id);
    if (!board) return res.status(404).json({ ok: false, message: "Version not found" });
    return res.status(200).json({ ok: true, data: board });
  } catch (err) {
    console.error("❌ getBoardById error:", err);
    return res.status(500).json({ ok: false, message: "Failed to fetch version" });
  }
}

// POST /api/complaint-board  → publish a new version of ONE table.
// Body: { boardType, periodLabel, rows, updatedBy }
async function createBoardVersion(req, res) {
  try {
    const { boardType, periodLabel, rows, updatedBy } = req.body || {};
    if (!BOARD_TYPES.includes(boardType)) {
      return res.status(400).json({ ok: false, message: "Invalid or missing boardType" });
    }

    const last = await ComplaintBoard.findOne({ boardType }).sort({ version: -1 });
    const nextVersion = last ? last.version + 1 : 1;

    // Demote the previously-current version of THIS table only.
    await ComplaintBoard.updateMany({ boardType, isCurrent: true }, { $set: { isCurrent: false } });

    const board = await ComplaintBoard.create({
      boardType,
      version: nextVersion,
      periodLabel: String(periodLabel ?? ""),
      rows: cleanRows(boardType, rows),
      updatedBy: String(updatedBy ?? ""),
      isCurrent: true,
    });

    return res.status(201).json({ ok: true, data: board });
  } catch (err) {
    console.error("❌ createBoardVersion error:", err);
    return res.status(500).json({ ok: false, message: "Failed to create version" });
  }
}

// PUT /api/complaint-board/:id  → edit a version in place (quick edit / fix a typo)
async function updateBoard(req, res) {
  try {
    const existing = await ComplaintBoard.findById(req.params.id);
    if (!existing) return res.status(404).json({ ok: false, message: "Version not found" });

    const { periodLabel, rows, updatedBy } = req.body || {};
    const update = {};
    if (periodLabel !== undefined) update.periodLabel = String(periodLabel);
    if (updatedBy !== undefined) update.updatedBy = String(updatedBy);
    if (rows !== undefined) update.rows = cleanRows(existing.boardType, rows);

    const board = await ComplaintBoard.findByIdAndUpdate(req.params.id, update, { new: true });
    return res.status(200).json({ ok: true, data: board });
  } catch (err) {
    console.error("❌ updateBoard error:", err);
    return res.status(500).json({ ok: false, message: "Failed to update version" });
  }
}

// PATCH /api/complaint-board/:id/set-current  → make an old version current again
async function setCurrentBoard(req, res) {
  try {
    const board = await ComplaintBoard.findById(req.params.id);
    if (!board) return res.status(404).json({ ok: false, message: "Version not found" });

    await ComplaintBoard.updateMany(
      { boardType: board.boardType, isCurrent: true },
      { $set: { isCurrent: false } }
    );
    board.isCurrent = true;
    await board.save();

    return res.status(200).json({ ok: true, data: board });
  } catch (err) {
    console.error("❌ setCurrentBoard error:", err);
    return res.status(500).json({ ok: false, message: "Failed to set current version" });
  }
}

// DELETE /api/complaint-board/:id  → remove a version
async function deleteBoard(req, res) {
  try {
    const board = await ComplaintBoard.findByIdAndDelete(req.params.id);
    if (!board) return res.status(404).json({ ok: false, message: "Version not found" });

    if (board.isCurrent) {
      const latest = await ComplaintBoard.findOne({ boardType: board.boardType }).sort({ version: -1 });
      if (latest) {
        latest.isCurrent = true;
        await latest.save();
      }
    }

    return res.status(200).json({ ok: true, message: "Version deleted" });
  } catch (err) {
    console.error("❌ deleteBoard error:", err);
    return res.status(500).json({ ok: false, message: "Failed to delete version" });
  }
}

module.exports = {
  getCurrentBoard,
  getHistory,
  getBoardById,
  createBoardVersion,
  updateBoard,
  setCurrentBoard,
  deleteBoard,
};
