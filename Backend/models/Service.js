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
    // Optional, backward-compatible one-line summary (the services grid shows
    // this at rest; the full `description` is revealed on hover/focus/tap).
    // Older records without it remain valid — the frontend falls back to the
    // first sentence of `description`, never inventing copy.
    shortDescription: {
      type: String,
      default: "",
      trim: true,
      maxlength: [90, "shortDescription must be 90 characters or fewer."],
    },
    // Optional, backward-compatible discipline grouping for the frontend
    // "Discipline Atlas" (which groups its orbit nodes by category). Empty string
    // means "ungrouped" — the frontend then renders one ungrouped ring and never
    // invents a category. Older records without it stay valid.
    category: {
      type: String,
      default: "",
      trim: true,
      lowercase: true,
      validate: {
        validator: (value) =>
          value === "" ||
          value === null ||
          value === undefined ||
          ["engineering", "growth", "design", "security", "operations"].includes(value),
        message:
          "category must be one of engineering, growth, design, security, operations (or empty).",
      },
    },
    // Optional accent hint for the atlas: a MICRO accent only (dots, crests,
    // tiny sparks). Growth Green is never used as a large fill.
    accent: {
      type: String,
      default: "blue",
      trim: true,
      lowercase: true,
      validate: {
        validator: (value) => ["blue", "navy", "green-micro"].includes(value),
        message: "accent must be blue, navy or green-micro.",
      },
    },
    // Optional, backward-compatible list of up to 3 short tag chips.
    highlights: {
      type: [String],
      default: [],
      validate: [
        {
          validator: (value) => !Array.isArray(value) || value.length <= 3,
          message: "highlights may contain at most 3 entries.",
        },
        {
          validator: (value) =>
            !Array.isArray(value) || value.every((entry) => String(entry).trim().length <= 24),
          message: "Each highlight must be 24 characters or fewer.",
        },
      ],
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

// Trim highlights entries on save so whitespace can never inflate a limit.
serviceSchema.pre("validate", function normalizeHighlights(next) {
  if (Array.isArray(this.highlights)) {
    this.highlights = this.highlights.map((entry) => String(entry).trim()).filter(Boolean);
  }
  next();
});

serviceSchema.index({ isVisible: 1, sortOrder: 1 });

export const Service = mongoose.model("Service", serviceSchema);
export default Service;
