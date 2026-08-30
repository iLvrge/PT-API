'use strict';

jest.mock('../../src/modules/comments/comments.repository');

const repo = require('../../src/modules/comments/comments.repository');
const service = require('../../src/modules/comments/comments.service');

const tenant = { id: 't' };

// use the real expandSubjectTypes (not mocked) for realistic behaviour
const actual = jest.requireActual('../../src/modules/comments/comments.repository');
beforeEach(() => {
  jest.clearAllMocks();
  repo.expandSubjectTypes.mockImplementation(actual.expandSubjectTypes);
});

describe('expandSubjectTypes', () => {
  it('expands asset to include error and fix', () => {
    expect(actual.expandSubjectTypes('asset').sort()).toEqual(['asset', 'error', 'fix']);
  });
  it('expands error to include asset', () => {
    expect(actual.expandSubjectTypes('error')).toContain('asset');
  });
  it('leaves record alone', () => {
    expect(actual.expandSubjectTypes('record')).toEqual(['record']);
  });
});

describe('comments.service reads', () => {
  it('listBySubjectType returns {} for a non-record type', async () => {
    await expect(service.listBySubjectType(tenant, 'asset')).resolves.toEqual({});
  });

  it('getBySubject nests comments (with user) under the activity', async () => {
    repo.listActivities.mockResolvedValue([{ activity_id: 1, subject: 'A' }]);
    repo.listCommentsFor.mockResolvedValue([
      { comment_id: 10, activity_id: 1, user_id: 5, comment: 'hi', u_user_id: 5, first_name: 'V' },
    ]);
    const result = await service.getBySubject(tenant, 'asset', 'A');
    expect(result.comments).toHaveLength(1);
    expect(result.comments[0].user.first_name).toBe('V');
  });
});

describe('comments.service.addComment', () => {
  it('refuses file uploads with 501', async () => {
    await expect(
      service.addComment(tenant, { userId: 5, subjectType: 'asset', subject: 'A', comment: 'x' }, true)
    ).rejects.toMatchObject({ statusCode: 501 });
  });

  it('refuses the fix share-link path with 501', async () => {
    await expect(
      service.addComment(tenant, { userId: 5, subjectType: 'fix', subject: 'A', comment: 'x' }, false)
    ).rejects.toMatchObject({ statusCode: 501 });
  });

  it('adds a comment to an existing activity', async () => {
    repo.findTypeByNames.mockResolvedValue({ type_id: 3, name: 'asset' });
    repo.findActivityBySubject.mockResolvedValue({ activity_id: 42 });
    repo.createComment.mockResolvedValue({});
    repo.findActivityById.mockResolvedValue({ activity_id: 42, subject: 'A' });
    repo.listCommentsFor.mockResolvedValue([]);

    await service.addComment(tenant, { userId: 5, subjectType: 'asset', subject: 'A', comment: 'hello' }, false);

    expect(repo.createActivity).not.toHaveBeenCalled();
    expect(repo.createComment).toHaveBeenCalledWith(tenant, { activity_id: 42, user_id: 5, comment: 'hello' });
  });

  it('creates a bare activity when none exists', async () => {
    repo.findTypeByNames.mockResolvedValue({ type_id: 3, name: 'asset' });
    repo.findActivityBySubject.mockResolvedValue(null);
    repo.createActivity.mockResolvedValue({ activity_id: 99 });
    repo.createComment.mockResolvedValue({});
    repo.findActivityById.mockResolvedValue({ activity_id: 99 });
    repo.listCommentsFor.mockResolvedValue([]);

    await service.addComment(tenant, { userId: 5, subjectType: 'asset', subject: 'B', comment: 'c' }, false);
    expect(repo.createActivity).toHaveBeenCalled();
    expect(repo.createComment).toHaveBeenCalledWith(tenant, { activity_id: 99, user_id: 5, comment: 'c' });
  });
});

describe('comments.service author checks', () => {
  it('update rejects a non-author with 403', async () => {
    repo.findComment.mockResolvedValue({ comment_id: 1, user_id: 9 });
    await expect(service.updateComment(tenant, 5, 1, 'x')).rejects.toMatchObject({ statusCode: 403 });
  });
  it('update 404 when missing', async () => {
    repo.findComment.mockResolvedValue(null);
    await expect(service.updateComment(tenant, 5, 1, 'x')).rejects.toMatchObject({ statusCode: 404 });
  });
  it('remove succeeds for the author', async () => {
    repo.findComment.mockResolvedValue({ comment_id: 1, user_id: 5 });
    repo.destroyComment.mockResolvedValue(1);
    await expect(service.removeComment(tenant, 5, 1)).resolves.toEqual({ comment_id: 1, deleted: true });
  });
});
