import mongoose from "mongoose";

const serviceSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Service title is required."],
      trim: true,
      maxlength: [80, "Title is too long."],
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    // Key resolved against the frontend inline-SVG icon system.
    icon: {
      type: String,
      required: [true, "Service icon key is required."],
      trim: true,
      maxlength: [40, "Icon key is too long."],
    },
    description: {
      type: String,
      required: [true, "Service description is required."],
      trim: true,
      minlength: [20, "Descriptions must be at least 20 characters."],
      maxlength: [400, "Description is too long."],
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
    // Optional "Exploded Logo Services Hub" placement (backward compatible).
    // `hubSlot` is 0..4 (which ribbon piece carries the label) or null when the
    // service is not featured in the hub. `hubLabel` overrides the displayed
    // label; it falls back to the title when empty.
    hubSlot: {
      type: Number,
      default: null,
      validate: {
        validator: (value) => value === null || (Number.isInteger(value) && value >= 0 && value <= 4),
        message: "hubSlot must be an integer between 0 and 4, or null.",
      },
    },
    hubLabel: {
      type: String,
      default: "",
      trim: true,
      maxlength: [60, "hubLabel is too long."],
    },
    isVisible: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

serviceSchema.index({ isVisible: 1, sortOrder: 1 });

export const Service = mongoose.model("Service", serviceSchema);
export default Service;
