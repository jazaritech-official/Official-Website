/**
 * Consistent API response shapes — the contract shared with the frontend.
 *
 * Success: { success: true, data, meta? }
 * Error:   { success: false, error: { code, message, details? } }
 */

export function sendData(res, data, status = 200, meta) {
  const body = { success: true, data };
  if (meta !== undefined) body.meta = meta;
  return res.status(status).json(body);
}

export function sendError(res, status, code, message, details) {
  const error = { code, message };
  if (details !== undefined) error.details = details;
  return res.status(status).json({ success: false, error });
}

export function paginationMeta({ page, limit, total }) {
  return {
    page,
    limit,
    total,
    totalPages: limit > 0 ? Math.max(1, Math.ceil(total / limit)) : 1,
    hasMore: page * limit < total,
  };
}
