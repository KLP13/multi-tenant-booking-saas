import { Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';

export interface RequestValidationSchema {
  body?: z.ZodTypeAny;
  query?: z.ZodTypeAny;
  params?: z.ZodTypeAny;
  headers?: z.ZodTypeAny;
}

/**
 * Express middleware to validate incoming request data (body, query, params)
 * using Zod schemas at the application boundary.
 */
export function validateRequest(schema: RequestValidationSchema) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (schema.params) {
        const parsedParams = await schema.params.parseAsync(req.params);
        if (req.params && typeof req.params === 'object') {
          Object.keys(req.params).forEach((k) => delete (req.params as any)[k]);
          Object.assign(req.params, parsedParams);
        }
      }
      if (schema.query) {
        const parsedQuery = await schema.query.parseAsync(req.query);
        if (req.query && typeof req.query === 'object') {
          Object.keys(req.query).forEach((k) => delete (req.query as any)[k]);
          Object.assign(req.query, parsedQuery);
        }
      }
      if (schema.body) {
        req.body = (await schema.body.parseAsync(req.body)) as any;
      }
      if (schema.headers) {
        await schema.headers.parseAsync(req.headers);
      }
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const issues = err.issues.map((issue) => ({
          field: issue.path.join('.') || 'root',
          message: issue.message,
          code: issue.code,
        }));

        const primaryMessage = issues[0]?.message || 'Invalid request data';

        if (req.log) {
          req.log.warn({ validationErrors: issues }, primaryMessage);
        }

        res.status(400).json({
          error: primaryMessage,
          validationErrors: issues,
          code: 'VALIDATION_ERROR',
          requestId: req.id,
        });
        return;
      }
      next(err);
    }
  };
}
