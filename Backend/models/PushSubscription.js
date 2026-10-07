import mongoose from "mongoose";

/**
 * One browser/device push subscription.
 *
 * The endpoint is the unique device identity (one per browser install), so a
 * repeat subscribe refreshes the record instead of duplicating it. Keys are
 * the client's public encryption material — never a secret we generate.
 */
const pushSubscriptionSchema = new mongoose.Schema(
  {
    endpoint: {
      type: String,
      required: [true, "Push endpoint is required."],
      unique: true,
      trim: true,
      maxlength: [1000, "Push endpoint is too long."],
    },
    keys: {
      p256dh: {
        type: String,
        required: [true, "Push subscription key (p256dh) is required."],
        trim: true,
        maxlength: [400, "p256dh key is too long."],
      },
      auth: {
        type: String,
        required: [true, "Push subscription key (auth) is required."],
        trim: true,
        maxlength: [400, "auth key is too long."],
      },
    },
    userAgent: {
      type: String,
      default: "",
      maxlength: [400, "User agent is too long."],
    },
    // Page the user enabled notifications from (analytics only).
    page: {
      type: String,
      default: "",
      maxlength: [500, "Page path is too long."],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Consecutive delivery failures. Reaching the configured ceiling
    // deactivates the device so dead endpoints stop being retried.
    failureCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastSeenAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

pushSubscriptionSchema.index({ isActive: 1, createdAt: -1 });
pushSubscriptionSchema.index({ createdAt: -1 });

export const PushSubscription = mongoose.model("PushSubscription", pushSubscriptionSchema);
export default PushSubscription;
