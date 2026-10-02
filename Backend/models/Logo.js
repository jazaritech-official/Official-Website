import mongoose from "mongoose";

const logoSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Logo name is required."],
      trim: true,
      maxlength: [120, "Logo name is too long."],
    },
    secureUrl: {
      type: String,
      required: [true, "Logo URL is required."],
      trim: true,
    },
    publicId: {
      type: String,
      required: [true, "Cloudinary public ID is required."],
      trim: true,
    },
    alt: {
      type: String,
      default: "",
      trim: true,
      maxlength: [160, "Alt text is too long."],
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

logoSchema.index({ isVisible: 1, sortOrder: 1 });
logoSchema.index({ publicId: 1 }, { unique: true });

export const Logo = mongoose.model("Logo", logoSchema);
export default Logo;
