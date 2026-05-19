// workers/start.js — standalone worker process entry point
// Run separately for production: `npm run worker`
require("dotenv").config();
const { connectDB } = require("../utils/db");
const { startSubmissionWorker } = require("./submission.worker");

const MONGO_URI = process.env.MONGO_URI;

(async () => {
  await connectDB(MONGO_URI);
  startSubmissionWorker();
  console.log("👷 Submission worker started (standalone)");
})();
