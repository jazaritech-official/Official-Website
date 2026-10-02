import mongoose from "mongoose";

/**
 * Lightweight, append-only audit trail for security-relevant admin actions:
 * admin created, role changed, activated/deactivated, password reset,
 * deleted and self-service password changes.
 *
 * Never record passwords, hashes, tokens or cookies — only safe metadata such
 * as the previous/new role or the activation state.
 */
const auditLogSchema = new mongoose.Schema(
  {
    actorId: { type: String, default: "" },
    actorEmail: { type: String, default: "" },
    action: { type: String, required: true, index: true },
    targetType: { type: String, default: "admin" },
    targetId: { type: String, default: "" },
    targetEmail: { type: String, default: "" },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    ip: { type: String, default: "" },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

auditLogSchema.index({ createdAt: -1 });

export const AuditLog = mongoose.model("AuditLog", auditLogSchema);
export default AuditLog;
