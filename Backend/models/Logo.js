import mongoose from "mongoose";

/**
 * Logo asset.
 *
 * `secureUrl`/`publicId` point at the *processed* delivery asset. The untouched
 * upload is preserved via `originalUrl`/`originalPublicId` so a logo can always
 * be reverted or reprocessed. Every processing/metadata field is optional so
 * documents created before Task C remain valid.
 */
const logoSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Logo name is required."],
      trim: true,
      maxlength: [120, "Logo name is too long."],
    },
    /** Optional human-friendly display name (falls back to `name`). */
    displayName: {
      type: String,
      default: "",
      trim: true,
      maxlength: [120, "Display name is too long."],
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
    /** Optional external product/company link (safe http/https only). */
    websiteUrl: {
      type: String,
      default: "",
      trim: true,
      maxlength: [500, "Website URL is too long."],
    },
    /** Preserved untouched upload. */
    originalUrl: { type: String, default: "", trim: true },
    originalPublicId: { type: String, default: "", trim: true },

    /* --- Processing metadata (optional; safe defaults for legacy docs) --- */
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    aspectRatio: { type: Number, default: null },
    hasAlpha: { type: Boolean, default: null },
    dominantColors: { type: [String], default: undefined },
    averageLuminance: { type: Number, default: null },
    tone: {
      type: String,
      enum: ["light", "dark", "colorful"],
      default: "light",
    },
    backgroundStatus: {
      type: String,
      enum: ["removed", "kept", "needs-transparent-png"],
      default: "kept",
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
