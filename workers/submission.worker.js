// workers/submission.worker.js
const { Worker } = require("bullmq");
const { connection } = require("../queues/redis.connection");
const { SUBMISSION_QUEUE } = require("../queues/submission.queue");
const Submission = require("../models/Submission");
const { generateInvoiceBuffer } = require("../services/invoice.service");
const { generateUserAgreementBuffer } = require("../services/agreement.service");
const { sendEmail } = require("../services/email.service");
const { welcomeEmailTemplate } = require("../templates/welcomeEmail");

async function processSubmissionJob(job) {
  const { submissionId } = job.data;
  const submission = await Submission.findById(submissionId);
  if (!submission) {
    throw new Error(`Submission ${submissionId} not found`);
  }

  const formattedStart = submission.paymentDate
    ? new Date(submission.paymentDate).toLocaleDateString("en-IN")
    : new Date().toLocaleDateString("en-IN");

  const emailHtml = welcomeEmailTemplate({
    name: submission.fullName,
    email: submission.email,
    mobile: submission.mobile,
    amount: submission.amount || 0,
    startDate: formattedStart,
    invoiceNo: submission.txnId ? `INV-${submission.txnId}` : "N/A",
    location: submission.location,
  });

  const tasks = [];

  if (submission.amount && submission.txnId) {
    tasks.push(
      (async () => {
        const invoiceBuffer = await generateInvoiceBuffer(submission);
        await sendEmail({
          to: submission.email,
          cc: process.env.EMAIL_CC,
          subject: "Welcome Onboard – Invoice",
          html: emailHtml,
          attachment: invoiceBuffer,
          filename: `Invoice_${submission.txnId}.pdf`,
        });
      })()
    );
  }

  if (submission.signature) {
    tasks.push(
      (async () => {
        const agreementBuffer = await generateUserAgreementBuffer(
          submission,
          submission.agreementIp
        );
        await sendEmail({
          to: submission.email,
          cc: process.env.EMAIL_CC,
          subject: "Agreement",
          html: emailHtml,
          attachment: agreementBuffer,
          filename: `Agreement_${submission.txnId || "user"}.pdf`,
        });
      })()
    );
  }

  if (!tasks.length) {
    return { skipped: true, reason: "no invoice or agreement data" };
  }

  await Promise.all(tasks);
  return { ok: true };
}

function startSubmissionWorker() {
  const worker = new Worker(SUBMISSION_QUEUE, processSubmissionJob, {
    connection,
    concurrency: parseInt(process.env.WORKER_CONCURRENCY || "2", 10),
  });

  worker.on("completed", (job) =>
    console.log(`✅ Job ${job.id} (sub ${job.data.submissionId}) done`)
  );
  worker.on("failed", (job, err) =>
    console.error(
      `❌ Job ${job?.id} (sub ${job?.data?.submissionId}) failed: ${err.message}`
    )
  );

  return worker;
}

module.exports = { startSubmissionWorker, processSubmissionJob };
