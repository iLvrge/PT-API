'use strict';

const { errorHandler, notFound } = require('../../src/middleware/error-handler');
const ApiError = require('../../src/utils/api-error');

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};
const req = { method: 'GET', originalUrl: '/x' };

describe('error-handler', () => {
  it('passes an ApiError through with its status and message', () => {
    const res = mockRes();
    errorHandler(ApiError.badRequest('nope', [{ field: 'a', message: 'bad' }]), req, res, () => {});
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: { message: 'nope', details: [{ field: 'a', message: 'bad' }] },
    });
  });

  it('maps SequelizeValidationError to 400 with field details', () => {
    const res = mockRes();
    const err = { name: 'SequelizeValidationError', errors: [{ path: 'last_name', message: 'cannot be null' }] };
    errorHandler(err, req, res, () => {});
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error.details[0].field).toBe('last_name');
  });

  it('maps SequelizeUniqueConstraintError to 409', () => {
    const res = mockRes();
    errorHandler({ name: 'SequelizeUniqueConstraintError', errors: [] }, req, res, () => {});
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('maps a JWT error to 401', () => {
    const res = mockRes();
    errorHandler({ name: 'JsonWebTokenError', message: 'jwt malformed' }, req, res, () => {});
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('hides the message for unexpected 500s', () => {
    const res = mockRes();
    errorHandler(new Error('DB password is foo'), req, res, () => {});
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json.mock.calls[0][0].error.message).toBe('Internal server error');
  });

  it('notFound produces a 404 ApiError', () => {
    const next = jest.fn();
    notFound({ method: 'GET', originalUrl: '/missing' }, {}, next);
    expect(next.mock.calls[0][0]).toBeInstanceOf(ApiError);
    expect(next.mock.calls[0][0].statusCode).toBe(404);
  });
});

describe('validate middleware — parameter merging', () => {
  const { z } = require('zod');
  const validate = require('../../src/middleware/validate');

  const run = (schema, req) => {
    const next = jest.fn();
    validate(schema)(req, {}, next);
    return next;
  };

  it('keeps route params the schema does not mention', () => {
    // A zod object strips undeclared keys. Replacing req.params with the parsed
    // object would delete `type` here, and the handler would read undefined for
    // a segment the URL plainly carried.
    const schema = z.object({ params: z.object({ id: z.coerce.number().int() }) });
    const req = { params: { id: '118', type: '1' }, body: {}, query: {} };

    const next = run(schema, req);
    expect(next).toHaveBeenCalledWith();
    expect(req.params).toEqual({ id: 118, type: '1' });
  });

  it('still coerces the params it does declare', () => {
    const schema = z.object({ params: z.object({ id: z.coerce.number().int() }) });
    const req = { params: { id: '118' }, body: {}, query: {} };
    run(schema, req);
    expect(req.params.id).toBe(118);
  });

  it('rejects a param that fails its rule', () => {
    const schema = z.object({ params: z.object({ id: z.coerce.number().int() }) });
    const req = { params: { id: 'abc' }, body: {}, query: {} };
    const next = run(schema, req);
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 400 });
  });
});
