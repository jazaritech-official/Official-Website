import mongoose from "mongoose";

const HIGHLIGHT_MIN = 2;
const HIGHLIGHT_MAX = 170;
const MAX_POINTS = 8;

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Product name is required."],
      trim: true,
      minlength: [2, "Product name is too short."],
      maxlength: [120, "Product name is too long."],
    },
    /** Legacy free-text logo URL. Kept for backward compatibility. */
    logo: {
      type: String,
      default: "",
      trim: true,
    },
    /**
     * Optional reference to a Homepage Logo (the Logo collection). Referenced,
     * never copied. Backward compatible: legacy products without `logoId` stay
     * valid and fall back to the designed monogram on the public card.
     */
    logoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Logo",
      default: null,
    },
    productUrl: {
      type: String,
      default: "",
      trim: true,
      validate: {
        validator: (value) => value === "" || isHttpUrl(value),
        message: "Product URL must be a valid http(s) URL.",
      },
    },
    category: {
      type: String,
      required: [true, "Product category is required."],
      trim: true,
      maxlength: [60, "Category is too long."],
    },
    highlightPoints: {
      type: [
        {
          type: String,
          trim: true,
          minlength: [HIGHLIGHT_MIN, "Highlight points must be meaningful."],
          maxlength: [HIGHLIGHT_MAX, "Highlight points must be under 170 characters."],
        },
      ],
      validate: {
        validator(points) {
          if (!Array.isArray(points) || points.length === 0) return false;
          if (points.length > MAX_POINTS) return false;
          return points.every((point) => typeof point === "string" && point.trim().length >= HIGHLIGHT_MIN);
        },
        message: "Provide between 1 and 8 non-empty highlight points.",
      },
    },
    isPublished: {
      type: Boolean,
      default: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

productSchema.index({ isPublished: 1, sortOrder: 1 });

export const Product = mongoose.model("Product", productSchema);
export default Product;
