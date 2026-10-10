import mongoose from "mongoose";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Permissive but structured: allows +, spaces, dashes, 7–20 digits.
const PHONE_RE = /^\+?[0-9][0-9\s\-().]{6,19}$/;

const submissionSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required."],
      trim: true,
      minlength: [2, "Name is too short."],
      maxlength: [120, "Name is too long."],
    },
    domain: {
      type: String,
      default: "",
      trim: true,
      maxlength: [200, "Domain is too long."],
    },
    phone: {
      type: String,
      default: "",
      trim: true,
      validate: {
        validator: (value) => value === "" || PHONE_RE.test(value),
        message: "Please provide a valid phone number.",
      },
    },
    email: {
      type: String,
      default: "",
      lowercase: true,
      trim: true,
      validate: {
        validator: (value) => value === "" || EMAIL_RE.test(value),
        message: "Please provide a valid email address.",
      },
    },
    service: {
      type: String,
      required: [true, "Service is required."],
      trim: true,
      maxlength: [120, "Service is too long."],
    },
    // OPTIONAL, backward-compatible intake fields (Task L). Submissions created
    // before these existed have no value and stay perfectly valid.
    message: {
      type: String,
      default: "",
      trim: true,
      maxlength: [1000, "Message is too long (max 1000 characters)."],
    },
    timeline: {
      type: String,
      default: "",
      enum: {
        values: ["", "asap", "1-3-months", "3-6-months", "exploring"],
        message: "Timeline must be one of asap, 1-3-months, 3-6-months or exploring.",
      },
    },
    // Human-friendly ID generated server-side and shown to the visitor.
    referenceId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    visitorIp: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: {
        values: ["New", "Contacted", "Closed"],
        message: "Status must be New, Contacted or Closed.",
      },
      default: "New",
    },
  },
  { timestamps: true },
);

// Business rule: at least one contact channel is mandatory.
submissionSchema.pre("validate", function enforceContact(next) {
  const hasEmail = Boolean(this.email && this.email.trim());
  const hasPhone = Boolean(this.phone && this.phone.trim());
  if (!hasEmail && !hasPhone) {
    this.invalidate("email", "Provide at least a phone number or an email address.");
  }
  next();
});

submissionSchema.index({ status: 1, createdAt: -1 });
submissionSchema.index({ createdAt: -1 });

export const Submission = mongoose.model("Submission", submissionSchema);
export default Submission;
