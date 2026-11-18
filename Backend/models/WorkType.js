import mongoose from "mongoose";

/**
 * WORK TYPE — the owner-editable price list ("30 Seconds Video = Rs 500").
 *
 * The owner adds, reprices and retires work types from /admin/work-types with
 * NO code changes. Orders snapshot the name and price at creation time
 * (`Order.items[].name` / `unitPriceMinor`), so editing a work type here NEVER
 * changes an order that already exists.
 *
 * MONEY: `unitPrice` is an INTEGER number of paisa (minor units), exactly like
 * every other money value in this codebase — the admin types rupees in the UI,
 * `parseMinor` converts on the way in and `formatMinor` converts on the way
 * out. Never a float.
 *
 * A work type is SOFT-deactivated while any order references it; it can only
 * be hard-deleted when it is unused (see controllers/workTypeController.js).
 */
const workTypeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required."],
      trim: true,
      minlength: [1, "Name is required."],
      maxlength: [60, "Name is too long (60 characters max)."],
    },
    /** Lower-cased name — the uniqueness key among ACTIVE work types. */
    nameKey: { type: String, trim: true, maxlength: 60, default: "" },
    /** INTEGER paisa (minor units). 50000 = Rs 500. */
    unitPrice: {
      type: Number,
      default: 0,
      validate: {
        validator: (value) => Number.isInteger(value) && value >= 0,
        message: "Price must be a whole number of paisa (no fractions, no negatives).",
      },
    },
    currency: { type: String, default: "PKR", trim: true, maxlength: [8, "Currency code is too long."] },
    description: { type: String, default: "", trim: true, maxlength: [160, "Description is too long (160 max)."] },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

workTypeSchema.index({ nameKey: 1 });
workTypeSchema.index({ isActive: 1, sortOrder: 1, name: 1 });

export const WorkType = mongoose.model("WorkType", workTypeSchema);
export default WorkType;
