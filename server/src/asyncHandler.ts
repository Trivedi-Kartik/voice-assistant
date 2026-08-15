import type { NextFunction, Request, RequestHandler, Response } from "express";

// Express 4 (this app's version) does NOT catch a rejected promise returned
// from an async route handler — it becomes an unhandled Node rejection,
// which by default crashes the *entire* process, taking down every
// connected user over one failed request. Confirmed live: a transient Neon
// Postgres connectivity blip during /auth/refresh crashed the whole server.
// Wrapping every async handler in this forwards the error to Express's own
// error-handling middleware (see index.ts) instead, so one failed request
// becomes one 500 response, not a full outage.
export function asyncHandler<Req extends Request = Request>(
  fn: (req: Req, res: Response, next: NextFunction) => Promise<void>
): RequestHandler {
  return (req, res, next) => {
    fn(req as Req, res, next).catch(next);
  };
}
