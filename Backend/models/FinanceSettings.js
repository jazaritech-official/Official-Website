import mongoose from "mongoose";

/**
 * FINANCE SETTINGS — the singleton (key "default") that holds:
 *   · the default split percentages (referrer 10%, worker 20% each)
 *   · the payment methods an admin may record
 *   · the client-facing "business block" printed on every bill
 *
 * Every ORDER snapshots these values when its split is saved, so editing the
 * settings later never rewrites history (spec 2.0a). No secrets are ever
 * stored here — it is printable business information only.
 */
export const DEFAULT_PAYMENT_METHODS = ["Cash", "Bank Transfer", "JazzCash", "Easypaisa", "Card", "Other"];

const financeSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, default: "default", unique: true },
    referrerBp: {
      type: Number,
      default: 1000,
      validate: {
        validator: (value) => Number.isInteger(value) && value >= 0 && value <= 10000,
        message: "Referrer percentage must be between 0 and 100% (basis points).",
      },
    },
    workerBp: {
      type: Number,
      default: 2000,
      validate: {
        validator: (value) => Number.isInteger(value) && value >= 0 && value <= 10000,
        message: "Worker percentage must be between 0 and 100% (basis points).",
      },
    },
    currency: { type: String, default: "PKR", trim: true, maxlength: [8, "Currency code is too long."] },
    paymentMethods: {
      type: [{ type: String, trim: true, maxlength: [40, "Payment method is too long."] }],
      default: () => [...DEFAULT_PAYMENT_METHODS],
      validate: {
        validator: (value) => Array.isArray(value) && value.length >= 1 && value.length <= 20,
        message: "Keep between 1 and 20 payment methods.",
      },
    },
    business: {
      businessName: { type: String, default: "Jazari Tech", trim: true, maxlength: [120, "Business name is too long."] },
      address: { type: String, default: "", trim: true, maxlength: [240, "Address is too long."] },
      phone: { type: String, default: "", trim: true, maxlength: [40, "Phone is too long."] },
      email: { type: String, default: "", trim: true, maxlength: [120, "Email is too long."] },
      website: { type: String, default: "", trim: true, maxlength: [160, "Website is too long."] },
      paymentInstructions: {
        type: String,
        default: "",
        trim: true,
        maxlength: [1200, "Payment instructions are too long."],
      },
      billFooterNote: {
        type: String,
        default: "Thank you for choosing Jazari Tech.",
        trim: true,
        maxlength: [240, "Footer note is too long."],
      },
    },
  },
  { timestamps: true, minimize: false },
);

financeSettingsSchema.statics.SINGLETON_KEY = "default";

export const FinanceSettings = mongoose.model("FinanceSettings", financeSettingsSchema);
export default FinanceSettings;
