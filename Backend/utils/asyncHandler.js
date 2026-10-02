/**
 * Wraps an async route handler so rejections reach the centralized error
 * handler instead of hanging the request.
 */
export const asyncHandler = (handler) =>
  function wrapped(req, res, next) {
    return Promise.resolve(handler(req, res, next)).catch(next);
  };

export default asyncHandler;
