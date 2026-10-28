import mongoose from "mongoose";

/**
 * CLIENT — the person or company an order is billed to.
 *
 * Clients are soft-deactivated, never hard-deleted while orders reference them
 * (the API answers 409). Name/phone/email are indexed for the searchable select
 * inside the order editor.
 */
const clientSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Client name is required."],
      trim: true,
      minlength: [2, "Client name is too short."],
      maxlength: [120, "Client name is too long."],
    },
    phone: { type: String, trim: true, maxlength: [40, "Phone is too long."], default: "" },
    email: { type: String, trim: true, maxlength: [120, "Email is too long."], default: "" },
    company: { type: String, trim: true, maxlength: [120, "Company is too long."], default: "" },
    address: { type: String, trim: true, maxlength: [240, "Address is too long."], default: "" },
    notes: { type: String, trim: true, maxlength: [500, "Notes are too long."], default: "" },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

// Search by name (case-insensitive prefix/contains) and by phone/email.
clientSchema.index({ name: 1 });
clientSchema.index({ phone: 1 });
clientSchema.index({ email: 1 });

export const Client = mongoose.model("Client", clientSchema);
export default Client;
