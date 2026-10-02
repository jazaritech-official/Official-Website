import mongoose from "mongoose";

const MAX_POINTS = 8;

const productTypeTemplateSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: [true, "Template type is required."],
      unique: true,
      trim: true,
      maxlength: [60, "Template type is too long."],
    },
    highlightPoints: {
      type: [
        {
          type: String,
          trim: true,
          minlength: [2, "Suggested points must be meaningful."],
          maxlength: [170, "Suggested points must be under 170 characters."],
        },
      ],
      validate: {
        validator(points) {
          if (!Array.isArray(points) || points.length === 0) return false;
          if (points.length > MAX_POINTS) return false;
          return points.every((point) => typeof point === "string" && point.trim().length >= 2);
        },
        message: "Provide between 1 and 8 non-empty highlight points.",
      },
    },
  },
  { timestamps: true },
);

export const ProductTypeTemplate = mongoose.model("ProductTypeTemplate", productTypeTemplateSchema);
export default ProductTypeTemplate;
