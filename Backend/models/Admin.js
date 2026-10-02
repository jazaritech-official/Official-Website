import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Admin roles.
 *  - `super_admin` — full access, including the team-management API.
 *  - `admin`       — every existing /api/admin/* capability except team management.
 *
 * Authorization is always re-read from the database on each request (see
 * `middleware/auth.js`), so a JWT role claim is never trusted on its own.
 */
export const ADMIN_ROLES = ["admin", "super_admin"];
export const SUPER_ADMIN = "super_admin";
export const ADMIN = "admin";

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
    name: {
      type: String,
      trim: true,
      default: "",
      maxlength: [120, "Name is too long."],
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    role: {
      type: String,
      enum: {
        values: ADMIN_ROLES,
        message: "Unsupported admin role.",
      },
      default: ADMIN,
    },
    /** Deactivated admins keep their record but immediately lose access. */
    isActive: {
      type: Boolean,
      default: true,
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

adminSchema.statics.ADMIN_ROLES = ADMIN_ROLES;
adminSchema.statics.SUPER_ADMIN = SUPER_ADMIN;
adminSchema.statics.ADMIN = ADMIN;

adminSchema.methods.verifyPassword = function verifyPassword(plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

/** Safe projection for API responses — never leaks the password hash. */
adminSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    email: this.email,
    name: this.name || "",
    role: this.role,
    isActive: this.isActive !== false,
    lastLoginAt: this.lastLoginAt,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

export const Admin = mongoose.model("Admin", adminSchema);
export default Admin;
