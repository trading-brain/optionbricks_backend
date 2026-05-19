// queues/submission.queue.js
const { Queue, QueueEvents } = require("bullmq");
const { connection } = require("./redis.connection");

const SUBMISSION_QUEUE = "submission-postprocess";

const submissionQueue = new Queue(SUBMISSION_QUEUE, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { count: 200, age: 24 * 3600 },
    removeOnFail: { count: 1000 },
  },
});

const submissionEvents = new QueueEvents(SUBMISSION_QUEUE, { connection });
submissionEvents.on("failed", ({ jobId, failedReason }) => {
  console.error(`❌ Job ${jobId} failed: ${failedReason}`);
});

async function enqueueSubmissionPostprocess(submissionId) {
  return submissionQueue.add(
    "postprocess",
    { submissionId: String(submissionId) },
    { jobId: `sub-${submissionId}` }
  );
}

module.exports = { submissionQueue, enqueueSubmissionPostprocess, SUBMISSION_QUEUE };
