'use strict';

const { errorHandler, notFound } = require('../../src/middleware/error-handler');
const ApiError = require('../../src/utils/api-error');

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.type = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};
const req = { method: 'GET', originalUrl: '/x' };

describe('error-handler', () => {
  it('passes an ApiError through with its status and message', () => {
    const res = mockRes();
    errorHandler(ApiError.badRequest('nope', [{ field: 'a', message: 'bad' }]), req, res, () => {});
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.type).toHaveBeenCalledWith('application/problem+json');
    const body = res.json.mock.calls[0][0];
    // RFC 7807 members...
    expect(body).toMatchObject({
      title: 'Bad Request',
      status: 400,
      detail: 'nope',
      instance: '/x',
      errors: [{ field: 'a', message: 'bad' }],
    });
    expect(body.type).toMatch(/\/errors\/bad-request$/);
    // ...and the pre-7807 envelope, still in the same body for the existing clients.
    expect(body.error).toEqual({
      message: 'nope',
      details: [{ field: 'a', message: 'bad' }],
    });
  });

  it('names the failure mode when a call site asked for one', () => {
    const res = mockRes();
    errorHandler(ApiError.notFound('Unknown share code', 'UNKNOWN_SHARE_CODE'), req, res, () => {});
    const body = res.json.mock.calls[0][0];
    expect(body.type).toMatch(/\/errors\/unknown-share-code$/);
    expect(body.title).toBe('Unknown Share Code');
    expect(body.status).toBe(404);
  });

  it('falls back to the status when no failure mode was named', () => {
    const res = mockRes();
    errorHandler(ApiError.notFound('no such asset'), req, res, () => {});
    expect(res.json.mock.calls[0][0].type).toMatch(/\/errors\/not-found$/);
  });

  it('maps SequelizeValidationError to 400 with field details', () => {
    const res = mockRes();
    const err = { name: 'SequelizeValidationError', errors: [{ path: 'last_name', message: 'cannot be null' }] };
    errorHandler(err, req, res, () => {});
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].errors[0].field).toBe('last_name');
    expect(res.json.mock.calls[0][0].error.details[0].field).toBe('last_name');
    expect(res.json.mock.calls[0][0].type).toMatch(/\/errors\/validation-error$/);
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
    expect(res.json.mock.calls[0][0].detail).toBe('Internal server error');
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

describe('deprecation headers (RFC 8594)', () => {
  const { deprecated, SUNSET } = require('../../src/middleware/deprecation');

  it('announces the deprecation on the response itself', () => {
    const headers = {};
    const res = { setHeader: (k, v) => { headers[k] = v; } };
    const next = jest.fn();

    deprecated({ reason: 'Use the header instead.', successor: '/docs#tag/Slack' })({}, res, next);

    expect(headers.Deprecation).toBe('true');
    expect(headers.Sunset).toBe(SUNSET.toUTCString());
    expect(headers.Link).toBe('</docs#tag/Slack>; rel="successor-version"');
    expect(headers.Warning).toBe('299 - "Use the header instead."');
    // The endpoint still runs: this is notice, not removal.
    expect(next).toHaveBeenCalled();
  });

  it('keeps the Warning header parseable when the reason quotes something', () => {
    const headers = {};
    const res = { setHeader: (k, v) => { headers[k] = v; } };
    deprecated({ reason: 'Send "x-slack-token" instead.' })({}, res, () => {});
    expect(headers.Warning).toBe(`299 - "Send 'x-slack-token' instead."`);
  });
});
