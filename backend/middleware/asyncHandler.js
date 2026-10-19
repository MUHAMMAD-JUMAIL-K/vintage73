/**
 * Async Handler Wrapper
 * Automatically catches errors in async route handlers and passes them to the error middleware.
 * elimiates the need for try-catch blocks in every controller.
 */
const asyncHandler = (fn) => (req, res, next) => {
    return Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
