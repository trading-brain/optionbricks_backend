// controllers/submission.controller.js
const multer = require("multer");
const Submission = require("../models/Submission");
const { uploadToCloudinary } = require("../services/cloudinary.service");
const { validateBody } = require("../utils/validate");
const { sendEmail } = require("../services/email.service");
const { welcomeEmailTemplate } = require("../templates/welcomeEmail");
const { generateInvoiceBuffer } = require("../services/invoice.service");
const { generateUserAgreementBuffer } = require("../services/agreement.service");
const { enqueueSubmissionPostprocess } = require("../queues/submission.queue");

const allowedMime = new Set(["application/pdf", "image/png", "image/jpeg"]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (allowedMime.has(file.mimetype)) cb(null, true);
    else cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", "Invalid file type."));
  },
});




const uploadFields = upload.fields([
  { name: "panDoc", maxCount: 1 },
  { name: "aadharDoc", maxCount: 1 },
]);




function sanitizeFileName(name) {
  return name
    .trim()                 // remove starting/ending spaces
    .replace(/\s+/g, "_")   // replace spaces with _
    .replace(/[^\w.-]/g, ""); // remove special characters
}

async function submit(req, res) {
  try {
    const files = req.files || {};
    const panFile = files.panDoc?.[0];
    const aadharFile = files.aadharDoc?.[0];

    // Validate input
    const errors = validateBody ? validateBody(req.body) : [];
    if (!panFile) errors.push({ field: "panDoc", message: "PAN document is required." });
    if (!aadharFile) errors.push({ field: "aadharDoc", message: "Aadhar document is required." });
    if (errors.length) return res.status(400).json({ ok: false, errors });

    // Upload to Cloudinary
    // const panDocMeta = await uploadToCloudinary(
    //   panFile.buffer,
    //   `${Date.now()}-${req.body.pan}-PAN-${panFile.originalname}`
    // );
    // const aadharDocMeta = await uploadToCloudinary(
    //   aadharFile.buffer,
    //   `${Date.now()}-${req.body.pan}-AADHAR-${aadharFile.originalname}`
    // );




    // sanitize inputs
const safePan = req.body.pan.trim().toUpperCase();
const panFileName = sanitizeFileName(panFile.originalname);
const aadharFileName = sanitizeFileName(aadharFile.originalname);

// Upload to Cloudinary
const panDocMeta = await uploadToCloudinary(
  panFile.buffer,
  `${Date.now()}-${safePan}-PAN-${panFileName}`
);

const aadharDocMeta = await uploadToCloudinary(
  aadharFile.buffer,
  `${Date.now()}-${safePan}-AADHAR-${aadharFileName}`
);

    // Save submission
    const submission = await Submission.create({
      fullName: req.body.fullName,
      email: req.body.email,
      mobile: req.body.mobile,
   pan: req.body.pan.toUpperCase(),
      dob: req.body.dob,
      amount: parseFloat(req.body.amount),
      paymentDate: req.body.paymentDate,
      txnId: req.body.txnId,
      agentName: req.body.agentName,
      panDoc: panDocMeta,
      aadharDoc: aadharDocMeta,
    });

    // Generate invoice PDF in memory
    const pdfBuffer = await generateInvoiceBuffer(submission);

    // Calculate subscription period (2 days sample)
    const startDate = new Date(submission.paymentDate);
    const endDate = new Date(startDate.getTime() + 2 * 86400000);
    const formattedStart = startDate.toLocaleDateString("en-IN");
    const formattedEnd = endDate.toLocaleDateString("en-IN");

    // Generate HTML email
    const emailHtml = welcomeEmailTemplate({
      name: submission.fullName,
      email: submission.email,         // ✅ added email
      mobile: submission.mobile,   
      amount: submission.amount,
      startDate: formattedStart,
      // endDate: formattedEnd,
      invoiceNo: `INV-${submission.txnId}`,
    });

    // Send via Hostinger SMTP
    await sendEmail({
      to: submission.email,
      cc: process.env.EMAIL_CC,
      subject: "Welcome Onboard – Your Research Service Details & Disclosures",
      html: emailHtml,
      attachment: pdfBuffer,
      filename: `Invoice_${submission.txnId}.pdf`,
    });

    return res.status(201).json({
      ok: true,
      message: "Submission saved and email sent with invoice.",
      data: submission,
    });
  } catch (err) {
    console.error("❌ Submit error:", err);
    return res.status(500).json({ ok: false, message: "Server error." });
  }
}








async function submitWithAgreement(req, res) {
  try {
    const files = req.files || {};
    const panFile = files.panDoc?.[0];
    const aadharFile = files.aadharDoc?.[0];

    const {
      fullName,
      email,
      mobile,
      signatureBase64,
      location,
      lat,
      lng,
    } = req.body;

    const errors = [];
    if (!fullName) errors.push({ field: "fullName", message: "Name is required" });
    if (!email) errors.push({ field: "email", message: "Email is required" });
    if (!mobile) errors.push({ field: "mobile", message: "Mobile is required" });
    if (errors.length) return res.status(400).json({ ok: false, errors });

    // Parallel Cloudinary uploads — halves wait time vs serial awaits
    const [panDocMeta, aadharDocMeta] = await Promise.all([
      panFile
        ? uploadToCloudinary(
            panFile.buffer,
            `${Date.now()}-${fullName}-PAN-${panFile.originalname}`
          )
        : Promise.resolve(null),
      aadharFile
        ? uploadToCloudinary(
            aadharFile.buffer,
            `${Date.now()}-${fullName}-AADHAR-${aadharFile.originalname}`
          )
        : Promise.resolve(null),
    ]);

    let clientIp = req.headers["x-forwarded-for"]?.split(",")[0] || req.ip;
    if (clientIp === "::1") clientIp = "127.0.0.1";
    if (clientIp?.startsWith("::ffff:")) clientIp = clientIp.replace("::ffff:", "");

    const formattedLocation = location
      ? `${location} | Lat: ${lat ?? "NA"}, Lng: ${lng ?? "NA"}`
      : `IP: ${clientIp}`;

    const submission = await Submission.create({
      fullName,
      email,
      mobile,
      pan: req.body.pan,
      dob: req.body.dob,
      amount: req.body.amount ? parseFloat(req.body.amount) : undefined,
      paymentDate: req.body.paymentDate,
      txnId: req.body.txnId,
      agentName: req.body.agentName,
      panDoc: panDocMeta,
      aadharDoc: aadharDocMeta,
      signature: signatureBase64,
      agreementAccepted: !!signatureBase64,
      agreementAcceptedAt: signatureBase64 ? new Date() : null,
      agreementIp: clientIp,
      location: formattedLocation,
    });

    // Hand off heavy work (PDF generation + emails) to BullMQ worker.
    // The submission row is the source of truth — even if enqueue fails,
    // the data is captured and the job can be replayed by an admin tool.
    try {
      await enqueueSubmissionPostprocess(submission._id);
    } catch (enqueueErr) {
      console.error(
        `⚠️  Enqueue failed for ${submission._id} — submission saved, will need manual replay:`,
        enqueueErr.message
      );
    }

    return res.status(201).json({
      ok: true,
      message: "Submission received. Email will arrive shortly.",
      data: submission,
    });
  } catch (err) {
    console.error("❌ Combined error:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
}






// GET all submissions (Admin Panel)
async function getSubmissions(req, res) {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      fromDate,
      toDate,
      includeDeleted,
      onlyDeleted,
    } = req.query;

    const skip = (page - 1) * limit;

    // 🔍 Search filter
    const searchQuery = search
      ? {
          $or: [
            { fullName: { $regex: search, $options: "i" } },
            { email: { $regex: search, $options: "i" } },
            { mobile: { $regex: search, $options: "i" } },
            { pan: { $regex: search, $options: "i" } },
            { txnId: { $regex: search, $options: "i" } },
          ],
        }
      : {};

    // 📅 Date filter
    const dateQuery = {};
    if (fromDate || toDate) {
      dateQuery.paymentDate = {};
      if (fromDate) dateQuery.paymentDate.$gte = new Date(fromDate);
      if (toDate) dateQuery.paymentDate.$lte = new Date(toDate);
    }

    // 🗑️ Soft-delete filter
    let deleteFilter = { isDeleted: { $ne: true } };
    if (onlyDeleted === "true") deleteFilter = { isDeleted: true };
    else if (includeDeleted === "true") deleteFilter = {};

    const query = {
      ...deleteFilter,
      ...searchQuery,
      ...dateQuery,
    };

    const [data, total] = await Promise.all([
      Submission.find(query)
        .sort({ createdAt: -1 }) // latest first
        .skip(skip)
        .limit(Number(limit)),
      Submission.countDocuments(query),
    ]);

    return res.status(200).json({
      ok: true,
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / limit),
      data,
    });
  } catch (err) {
    console.error("❌ Get submissions error:", err);
    return res.status(500).json({
      ok: false,
      message: "Failed to fetch submissions",
    });
  }
}




// GET submission by ID
async function getSubmissionById(req, res) {
  try {
    const { id } = req.params;
    const { includeDeleted } = req.query;

    const query = { _id: id };
    if (includeDeleted !== "true") query.isDeleted = { $ne: true };

    const submission = await Submission.findOne(query);
    if (!submission) {
      return res.status(404).json({
        ok: false,
        message: "Submission not found",
      });
    }

    return res.status(200).json({
      ok: true,
      data: submission,
    });
  } catch (err) {
    console.error("❌ Get submission error:", err);
    return res.status(500).json({
      ok: false,
      message: "Failed to fetch submission",
    });
  }
}

// SOFT DELETE submission
async function softDeleteSubmission(req, res) {
  try {
    const { id } = req.params;

    const submission = await Submission.findOneAndUpdate(
      { _id: id, isDeleted: { $ne: true } },
      { $set: { isDeleted: true, deletedAt: new Date() } },
      { new: true }
    );

    if (!submission) {
      return res.status(404).json({
        ok: false,
        message: "Submission not found or already deleted",
      });
    }

    return res.status(200).json({
      ok: true,
      message: "Submission soft-deleted",
      data: submission,
    });
  } catch (err) {
    console.error("❌ Soft delete error:", err);
    return res.status(500).json({
      ok: false,
      message: "Failed to soft delete submission",
    });
  }
}

// RESTORE soft-deleted submission
async function restoreSubmission(req, res) {
  try {
    const { id } = req.params;

    const submission = await Submission.findOneAndUpdate(
      { _id: id, isDeleted: true },
      { $set: { isDeleted: false, deletedAt: null } },
      { new: true }
    );

    if (!submission) {
      return res.status(404).json({
        ok: false,
        message: "Deleted submission not found",
      });
    }

    return res.status(200).json({
      ok: true,
      message: "Submission restored",
      data: submission,
    });
  } catch (err) {
    console.error("❌ Restore error:", err);
    return res.status(500).json({
      ok: false,
      message: "Failed to restore submission",
    });
  }
}

module.exports = {
  uploadFields,
  submit,
  getSubmissions,
  getSubmissionById,
  submitWithAgreement,
  softDeleteSubmission,
  restoreSubmission,
};
