// seed-complaint-board.js
// One-time seed: stores the data currently hardcoded on the frontend complaint
// board page as version 1 of EACH table (complaint / monthly / annual).
// Run once:  node seed-complaint-board.js
require("dotenv").config();
const mongoose = require("mongoose");
const { connectDB } = require("./utils/db");
const ComplaintBoard = require("./models/ComplaintBoard");

const complaintRows = [
  { srNo: 1, receivedFrom: "Directly from Investors", pendingAtEndOfLastMonth: 0, received: 0, receivedStar: 0, totalPending: 0, pendingComplaintOver3Months: 0, avgResolutionTime: "0" },
  { srNo: 2, receivedFrom: "SEBI (SCORES)", pendingAtEndOfLastMonth: 0, received: 5, receivedStar: 5, totalPending: 0, pendingComplaintOver3Months: 0, avgResolutionTime: "8" },
  { srNo: 3, receivedFrom: "Other Sources (If any)", pendingAtEndOfLastMonth: 0, received: 0, receivedStar: 0, totalPending: 0, pendingComplaintOver3Months: 0, avgResolutionTime: "0" },
  { srNo: "", receivedFrom: "Grand Total", pendingAtEndOfLastMonth: 0, received: 0, receivedStar: 0, totalPending: 0, pendingComplaintOver3Months: 0, avgResolutionTime: "8" },
];

const monthlyRows = [
  { srNo: 1, month: "May-2025", carriedForwardFromPreviousMonth: 0, received: 0, receivedStar: 0, pending: 0 },
  { srNo: 2, month: "June-2025", carriedForwardFromPreviousMonth: 0, received: 0, receivedStar: 0, pending: 0 },
  { srNo: 3, month: "July-2025", carriedForwardFromPreviousMonth: 0, received: 0, receivedStar: 0, pending: 0 },
  { srNo: 4, month: "Aug-2025", carriedForwardFromPreviousMonth: 0, received: 0, receivedStar: 0, pending: 0 },
  { srNo: 5, month: "Sep-2025", carriedForwardFromPreviousMonth: 0, received: 0, receivedStar: 0, pending: 0 },
  { srNo: 6, month: "Oct-2025", carriedForwardFromPreviousMonth: 0, received: 0, receivedStar: 0, pending: 0 },
  { srNo: 7, month: "Nov-2025", carriedForwardFromPreviousMonth: 0, received: 0, receivedStar: 0, pending: 0 },
  { srNo: 8, month: "Dec-2025", carriedForwardFromPreviousMonth: 0, received: 0, receivedStar: 0, pending: 0 },
  { srNo: 9, month: "Jan-2025", carriedForwardFromPreviousMonth: 0, received: 0, receivedStar: 0, pending: 0 },
  { srNo: 10, month: "Feb-2025", carriedForwardFromPreviousMonth: 0, received: 1, receivedStar: 1, pending: 0 },
  { srNo: 11, month: "March-2025", carriedForwardFromPreviousMonth: 0, received: 4, receivedStar: 0, pending: 4 },
  { srNo: 12, month: "April-2025", carriedForwardFromPreviousMonth: 0, received: 0, receivedStar: 0, pending: 0 },
  { srNo: 13, month: "May-2025", carriedForwardFromPreviousMonth: 4, received: 0, receivedStar: 4, pending: 0 },
  { srNo: "", month: "Grand Total", carriedForwardFromPreviousMonth: 0, received: 5, receivedStar: 5, pending: 0 },
];

const annualRows = [
  { srNo: 1, year: "2024-2025", carriedForwardFromPreviousMonth: 0, received: 0, receivedStar: 0, pending: 0 },
  { srNo: 2, year: "2025-2026", carriedForwardFromPreviousMonth: 0, received: 5, receivedStar: 5, pending: 0 },
  { srNo: "", year: "Grand Total", carriedForwardFromPreviousMonth: 0, received: 5, receivedStar: 5, pending: 0 },
];

const SEED = [
  { boardType: "complaint", rows: complaintRows },
  { boardType: "monthly", rows: monthlyRows },
  { boardType: "annual", rows: annualRows },
];

async function run() {
  await connectDB(process.env.MONGO_URI);

  for (const { boardType, rows } of SEED) {
    const existing = await ComplaintBoard.findOne({ boardType }).sort({ version: -1 });
    if (existing) {
      console.log(`ℹ️  "${boardType}" already has data (latest version ${existing.version}). Skipping.`);
      continue;
    }
    const doc = await ComplaintBoard.create({
      boardType,
      version: 1,
      periodLabel: "Initial (seeded)",
      rows,
      isCurrent: true,
      updatedBy: "seed",
    });
    console.log(`✅ Seeded "${boardType}" as version 1 (id ${doc._id}).`);
  }

  await mongoose.disconnect();
  process.exit(0);
}

run().catch(async (err) => {
  console.error("❌ Seed failed:", err);
  await mongoose.disconnect();
  process.exit(1);
});
