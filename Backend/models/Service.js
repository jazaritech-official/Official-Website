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
