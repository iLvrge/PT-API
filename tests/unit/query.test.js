'use strict';

const q = require('../../src/db/query');

describe('db/query helpers', () => {
  describe('identifier', () => {
    it('returns the value when it is in the allowlist', () => {
      expect(q.identifier('asset', ['asset', 'grant_date'], 'asset')).toBe('asset');
    });

    it('falls back when the value is not allowed (blocks ORDER BY injection)', () => {
      expect(q.identifier('asset; DROP TABLE user', ['asset'], 'asset')).toBe('asset');
    });

    it('accepts a Set as the allowlist', () => {
      expect(q.identifier('b', new Set(['a', 'b']), 'a')).toBe('b');
    });
  });

  describe('direction', () => {
    it('normalises ASC/DESC and rejects anything else', () => {
      expect(q.direction('asc')).toBe('ASC');
      expect(q.direction('DESC')).toBe('DESC');
      expect(q.direction('ASC, (SELECT 1)')).toBe('DESC');
      expect(q.direction(undefined)).toBe('DESC');
    });
  });

  describe('connection guard', () => {
    it('rejects when called without a connection', async () => {
      await expect(q.selectAll(null, 'SELECT 1')).rejects.toThrow(/without a Sequelize connection/);
    });
  });

  describe('selectOne / selectValue over a fake connection', () => {
    const fakeDb = {
      query: jest.fn(),
    };

    beforeEach(() => fakeDb.query.mockReset());

    it('selectOne returns the plain row', async () => {
      fakeDb.query.mockResolvedValue({ id: 7, name: 'x' });
      const row = await q.selectOne(fakeDb, 'SELECT ... LIMIT 1', { a: 1 });
      expect(row).toEqual({ id: 7, name: 'x' });
      expect(fakeDb.query).toHaveBeenCalledWith(
        'SELECT ... LIMIT 1',
        expect.objectContaining({ replacements: { a: 1 }, plain: true, raw: true, logging: false })
      );
    });

    it('selectOne returns null when there is no row', async () => {
      fakeDb.query.mockResolvedValue(undefined);
      await expect(q.selectOne(fakeDb, 'SELECT ...')).resolves.toBeNull();
    });

    it('selectValue reads a named column with a fallback', async () => {
      fakeDb.query.mockResolvedValue({ total: 42 });
      await expect(q.selectValue(fakeDb, 'SELECT ...', {}, 'total', 0)).resolves.toBe(42);
      fakeDb.query.mockResolvedValue(undefined);
      await expect(q.selectValue(fakeDb, 'SELECT ...', {}, 'total', 0)).resolves.toBe(0);
    });
  });
});
