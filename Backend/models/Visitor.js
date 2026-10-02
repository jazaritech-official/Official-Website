import mongoose from "mongoose";

const visitorSchema = new mongoose.Schema(
  {
    ip: {
      type: String,
      default: "",
    },
    // Normalized form used for deduplication (IPv6 compressed, IPv4-mapped unwrapped).
    normalizedIp: {
      type: String,
      required: true,
    },
    userAgent: {
      type: String,
      default: "",
      maxlength: [400, "User agent is too long."],
    },
    page: {
      type: String,
      default: "",
      maxlength: [500, "Page path is too long."],
    },
    referrer: {
      type: String,
      default: "",
      maxlength: [500, "Referrer is too long."],
    },
    // Start of the dedupe window this record represents (default: one per IP/day).
    visitDate: {
      type: Date,
      required: true,
    },
    visitCount: {
      type: Number,
      default: 1,
      min: 1,
    },
    lastVisitedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

// Dedupe lookup: same normalized IP inside the window.
visitorSchema.index({ normalizedIp: 1, visitDate: -1 });
visitorSchema.index({ visitDate: -1 });

export const Visitor = mongoose.model("Visitor", visitorSchema);
export default Visitor;
