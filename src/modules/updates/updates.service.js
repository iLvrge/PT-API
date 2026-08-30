'use strict';

const repository = require('./updates.repository');

const EMPTY = Object.fromEntries(repository.COUNTERS.map((column) => [column, 0]));

// The dashboard sends the literal string "undefined" when no company is
// selected, and 0 for "all companies".
const isUnset = (name) => name === undefined || name === null || name === '' || name === 'undefined';
const isAllCompanies = (name) => `${name}` === '0';

/**
 * Weekly / monthly / quarterly counters, either for one company or summed
 * across the organisation.
 */
const counters = async (tenant, orgId, companyName) => {
  let name = companyName;
  if (isUnset(name)) name = await repository.organisationName(orgId);
  if (isUnset(name) || isAllCompanies(name)) {
    return (await repository.forOrganisation(orgId)) || { ...EMPTY };
  }

  const parent = await repository.findParentRepresentative(tenant, name);
  if (!parent || !(parent.representative_id > 0)) return { ...EMPTY };

  return (await repository.forRepresentative(orgId, parent.representative_id)) || { ...EMPTY };
};

module.exports = { counters, EMPTY };
