import AuditLog from "../models/AuditLog.js";

/**
 * Record a security-relevant action. Deliberately fire-and-forget: an audit
 * write must never break or delay the primary request, and it never contains
 * secrets (no passwords, hashes, tokens or cookies).
 */
export function recordAudit(req, action, { target, metadata } = {}) {
  const doc = {
    actorId: req?.admin?.id ?? "",
    actorEmail: req?.admin?.email ?? "",
    action,
    targetType: "admin",
    targetId: target?.id ?? "",
    targetEmail: target?.email ?? "",
    metadata: metadata ?? {},
    ip: req?.ip ?? "",
  };

  AuditLog.create(doc).catch((error) => {
    // Never surface audit failures to the caller; log the message only.
    console.warn(`[audit] failed to record "${action}": ${error.message}`);
  });
}

export default recordAudit;
