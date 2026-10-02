import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const adminSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, "Email is required."],
      unique: true,
      lowercase: true,
      trim: true,
      match: [EMAIL_RE, "Please provide a valid email address."],
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    // Reserved for future expansion (admin, editor, super-admin).
    role: {
      type: String,
      enum: {
        values: ["admin", "editor", "super-admin"],
        message: "Unsupported admin role.",
      },
      default: "admin",
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

adminSchema.statics.hashPassword = function hashPassword(plain) {
  return bcrypt.hash(plain, 12);
};

adminSchema.methods.verifyPassword = function verifyPassword(plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

/** Safe projection for API responses — never leaks the password hash. */
adminSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    email: this.email,
    role: this.role,
    lastLoginAt: this.lastLoginAt,
    createdAt: this.createdAt,
  };
};

export const Admin = mongoose.model("Admin", adminSchema);
export default Admin;
