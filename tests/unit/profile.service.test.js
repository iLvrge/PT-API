'use strict';

jest.mock('../../src/modules/profile/profile.repository');

const repository = require('../../src/modules/profile/profile.repository');
const service = require('../../src/modules/profile/profile.service');

describe('profile.service', () => {
  beforeEach(() => jest.clearAllMocks());

  it('maps organisation_type codes to the legacy labels', () => {
    expect(service.orgTypeLabel(2)).toBe('Bank');
    expect(service.orgTypeLabel(3)).toBe('Law Firm');
    expect(service.orgTypeLabel(4)).toBe('University');
    expect(service.orgTypeLabel(5)).toBe('Goverment');
    expect(service.orgTypeLabel(1)).toBe('Company');
    expect(service.orgTypeLabel(undefined)).toBe('Company');
  });

  it('shapes the profile with role and organisation', async () => {
    repository.findProfile.mockResolvedValue({
      id: 335,
      first_name: 'Vivek',
      last_name: 'Test',
      email_address: 'v@x.com',
      logo: null,
      job_title: 'QA',
      role_name: 'Manager',
      organisation_id: 118,
      organisation_name: 'Vivek3',
      subscribtion: 1,
      organisation_logo: 'logo.png',
      organisation_type: 3,
    });

    const result = await service.getProfile(335);
    expect(result.user.id).toBe(335);
    expect(result.user.role.name).toBe('Manager');
    expect(result.user.organisation.organisation_type).toBe('Law Firm');
    expect(result.user.organisation.organisation_id).toBe(118);
  });

  it('401 when no active user is found', async () => {
    repository.findProfile.mockResolvedValue(null);
    await expect(service.getProfile(999)).rejects.toMatchObject({ statusCode: 401 });
  });
});
