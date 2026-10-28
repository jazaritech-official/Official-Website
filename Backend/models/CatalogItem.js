import mongoose from "mongoose";

/**
 * CATALOG ITEM — the default line items an admin picks from in the order
 * editor (Video Ad Making, Graphic Designing, …).
 *
 * `defaultUnitPriceMinor` starts at 0 so the admin always types the real price
 * for that job; the name is de-duplicated case-insensitively through `nameKey`
 * (a unique index on `name` alone would treat "logo design" and "Logo Design"
 * as two different rows).
 */
const catalogSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Item name is required."],
      trim: true,
      minlength: [2, "Item name is too short."],
      maxlength: [120, "Item name is too long."],
    },
    /** Lower-cased, trimmed `name` — the uniqueness key. */
    nameKey: { type: String, trim: true, default: "" },
    unitLabel: {
      type: String,
      required: [true, "Unit label is required."],
      trim: true,
      minlength: [1, "Unit label is required."],
      maxlength: [24, "Unit label is too long."],
    },
    defaultUnitPriceMinor: {
      type: Number,
      default: 0,
      min: [0, "Price cannot be negative."],
      validate: {
        validator: (value) => Number.isInteger(value),
        message: "Price must be a whole number of paisa.",
      },
    },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

catalogSchema.pre("validate", function normalise(next) {
  this.nameKey = String(this.name || "").trim().toLowerCase();
  next();
});

catalogSchema.index({ nameKey: 1 }, { unique: true });
catalogSchema.index({ isActive: 1, sortOrder: 1 });

export const CatalogItem = mongoose.model("CatalogItem", catalogSchema);
export default CatalogItem;
