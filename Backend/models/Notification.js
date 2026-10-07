import mongoose from "mongoose";

/**
 * An admin-composed push notification. It is created as a draft and only sent
 * when the admin presses Send (or opts to send immediately). Delivery stats are
 * recorded on the same document so the admin panel can show real numbers.
 */
const notificationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Notification title is required."],
      trim: true,
      minlength: [2, "Title must be at least 2 characters."],
      maxlength: [80, "Title is too long (80 characters maximum)."],
    },
    body: {
      type: String,
      required: [true, "Notification message is required."],
      trim: true,
      minlength: [2, "Message must be at least 2 characters."],
      maxlength: [200, "Message is too long (200 characters maximum)."],
    },
    // Where a tap opens the site. Relative path or absolute http(s) URL.
    url: {
      type: String,
      default: "/",
      trim: true,
      maxlength: [500, "Link is too long."],
    },
    // Optional override for the notification icon; falls back to the app icon.
    icon: {
      type: String,
      default: "",
      trim: true,
      maxlength: [500, "Icon URL is too long."],
    },
    // Notification tag — same tag replaces a still-visible notification.
    tag: {
      type: String,
      default: "",
      trim: true,
      maxlength: [60, "Tag is too long."],
    },
    // Optional Service slug this message was composed from (the admin composer
    // can pre-fill copy from a real service). Purely descriptive metadata.
    serviceSlug: {
      type: String,
      default: "",
      trim: true,
      maxlength: [80, "Service slug is too long."],
    },
    status: {
      type: String,
      enum: ["draft", "sent", "failed"],
      default: "draft",
    },
    stats: {
      targeted: { type: Number, default: 0 },
      sent: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      removed: { type: Number, default: 0 },
    },
    error: {
      type: String,
      default: "",
      maxlength: [400, "Error message is too long."],
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    createdByName: {
      type: String,
      default: "",
      maxlength: [120, "Name is too long."],
    },
    sentAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ status: 1 });

export const Notification = mongoose.model("Notification", notificationSchema);
export default Notification;
