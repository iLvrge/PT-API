'use strict';

// Guards the AssetForSale model's primary key column name against the real
// table. It used to be declared as `id`, but db_new_application.assets_for_sale
// has no such column — its primary key is `sales_id` — so every call to
// POST /assets/assets_for_sale (listForSale -> AssetForSale.bulkCreate) died
// with "Unknown column 'id' in 'field list'". A mocked repository (as
// assets.service.test.js uses) cannot see this: the mismatch lives entirely in
// the Sequelize model definition, so the real repository module is loaded here
// and the model's own attribute map is asserted directly. Sequelize's
// `.define()` only registers the model — it never opens a connection — so this
// is safe to do without a live database.

const { connections } = require('../../src/db');
require('../../src/modules/assets/assets.repository');

describe('assets.repository AssetForSale model', () => {
  it('declares the real primary key column (sales_id), not a guessed one', () => {
    const model = connections.applicationNew.models.assets_for_sale;
    expect(model).toBeDefined();

    const attributes = model.rawAttributes;
    expect(attributes.sales_id).toBeDefined();
    expect(attributes.sales_id.primaryKey).toBe(true);
    expect(attributes.id).toBeUndefined();
  });

  it('keeps the other real columns intact', () => {
    const attributes = connections.applicationNew.models.assets_for_sale.rawAttributes;
    expect(Object.keys(attributes).sort()).toEqual(
      ['appno_doc_num', 'grant_doc_num', 'organisation_id', 'sales_id', 'type'].sort()
    );
  });
});
