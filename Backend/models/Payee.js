import mongoose from "mongoose";

/**
 * PAYEE — a person who receives a share of an order (a worker or the referrer
 * who brought the client in).
 *
 * These are NOT admin accounts: they have no login, no password and no access
 * to anything. They exist purely so the split can name a human being. The
 * Admin model is deliberately not reused (spec 2.1).
 */
export const PAYEE_ROLES = ["worker", "referrer", "both"];

const payeeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required."],
      trim: true,
      minlength: [2, "Name is too short."],
      maxlength: [120, "Name is too long."],
    },
    role: {
      type: String,
      required: [true, "Role is required."],
      enum: { values: PAYEE_ROLES, message: "Role must be worker, referrer or both." },
      default: "worker",
    },
    phone: { type: String, trim: true, maxlength: [40, "Phone is too long."], default: "" },
    notes: { type: String, trim: true, maxlength: [300, "Notes are too long."], default: "" },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

payeeSchema.index({ name: 1 });
payeeSchema.index({ role: 1, isActive: 1 });

export const Payee = mongoose.model("Payee", payeeSchema);
export default Payee;
