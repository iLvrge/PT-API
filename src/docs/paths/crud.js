'use strict';

/**
 * The tenant-scoped CRUD resources: telephone numbers, law firms and their
 * addresses, company addresses, category/product trees, collections,
 * professionals, comments, activities and per-user selections.
 *
 * Every one of these reads and writes the caller's own tenant database, so they
 * all answer 503 when that database is unreachable.
 */

const h = require('../helpers');

const E = h.TENANT_ERRORS;
const notFound = (what) => ({ 404: h.errorResponse(`No such ${what}.`) });

module.exports = {
  /* ------------------------------------------------------------ telephone */
  '/telephone': {
    get: h.operation({
      tag: 'Telephone',
      summary: 'List telephone numbers for companies',
      params: [h.jsonArrayQuery('companies', 'Representative ids to list numbers for.')],
      ok: h.listResponse('Telephone numbers.'),
      errors: E,
    }),
    post: h.operation({
      tag: 'Telephone',
      summary: 'Add a telephone number to a company',
      body: h.jsonBody({
        type: 'object',
        required: ['representative_id', 'telephone_number'],
        properties: {
          representative_id: { type: 'integer', example: 9 },
          telephone_number: { type: 'string', example: '+1 212 555 0100' },
        },
      }),
      ok: h.objectResponse('Created.'),
      status: 201,
      errors: E,
    }),
  },
  '/telephone/{telephoneId}': {
    delete: h.operation({
      tag: 'Telephone',
      summary: 'Delete a telephone number',
      params: [h.numericPathParam('telephoneId', 'Telephone id.')],
      ok: h.objectResponse('Deleted.'),
      errors: E,
      extraResponses: notFound('telephone number'),
    }),
  },

  /* -------------------------------------------------------------- lawfirm */
  '/lawfirm': {
    get: h.operation({
      tag: 'Law firms',
      summary: 'List law firms',
      params: [h.jsonArrayQuery('companies', 'Restrict to firms linked to these companies.')],
      ok: h.listResponse('Law firms.'),
      errors: E,
    }),
    post: h.operation({
      tag: 'Law firms',
      summary: 'Create a law firm',
      body: h.jsonBody({
        type: 'object',
        required: ['name'],
        properties: { name: { type: 'string', example: 'Fish & Richardson' } },
      }),
      ok: h.objectResponse('Created.'),
      status: 201,
      errors: E,
    }),
  },
  '/lawfirm/{lawfirmId}': {
    put: h.operation({
      tag: 'Law firms',
      summary: 'Rename a law firm',
      params: [h.numericPathParam('lawfirmId', 'Law firm id.')],
      body: h.jsonBody({ type: 'object', properties: { name: { type: 'string' } } }),
      ok: h.objectResponse('Updated.'),
      errors: E,
      extraResponses: notFound('law firm'),
    }),
    delete: h.operation({
      tag: 'Law firms',
      summary: 'Delete a law firm',
      params: [h.numericPathParam('lawfirmId', 'Law firm id.')],
      ok: h.objectResponse('Deleted.'),
      errors: E,
      extraResponses: notFound('law firm'),
    }),
  },

  /* ------------------------------------------------------ lawfirm address */
  '/lawfirm_address': {
    get: h.operation({
      tag: 'Law firms',
      summary: 'List every law firm address',
      ok: h.listResponse('Addresses.'),
      errors: E,
    }),
    post: h.operation({
      tag: 'Law firms',
      summary: 'Add an address to a law firm',
      body: h.jsonBody(h.ref('AddressInput')),
      ok: h.objectResponse('Created.'),
      status: 201,
      errors: E,
    }),
  },
  '/lawfirm_address/{lawfirmId}': {
    get: h.operation({
      tag: 'Law firms',
      summary: "One law firm's addresses",
      params: [h.numericPathParam('lawfirmId', 'Law firm id.')],
      ok: h.listResponse('Addresses.'),
      errors: E,
    }),
  },
  '/lawfirm_address/{addressId}': {
    put: h.operation({
      tag: 'Law firms',
      summary: 'Update a law firm address',
      params: [h.numericPathParam('addressId', 'Address id.')],
      body: h.jsonBody(h.ref('AddressInput'), false),
      ok: h.objectResponse('Updated.'),
      errors: E,
      extraResponses: notFound('address'),
    }),
    delete: h.operation({
      tag: 'Law firms',
      summary: 'Delete a law firm address',
      params: [h.numericPathParam('addressId', 'Address id.')],
      ok: h.objectResponse('Deleted.'),
      errors: E,
      extraResponses: notFound('address'),
    }),
  },

  /* -------------------------------------------------------------- address */
  '/address': {
    get: h.operation({
      tag: 'Addresses',
      summary: 'Company addresses, grouped by company',
      params: [h.jsonArrayQuery('companies', 'Representative ids.')],
      ok: h.listResponse('One entry per company, each with its addresses.'),
      errors: E,
    }),
    post: h.operation({
      tag: 'Addresses',
      summary: 'Add an address to a company',
      body: h.jsonBody(h.ref('AddressInput')),
      ok: h.objectResponse('Created.'),
      status: 201,
      errors: E,
    }),
  },
  '/address/companies': {
    get: h.operation({
      tag: 'Addresses',
      summary: 'Company addresses as a flat list',
      params: [h.jsonArrayQuery('companies', 'Representative ids.')],
      ok: h.listResponse('Addresses.'),
      errors: E,
    }),
  },
  '/address/{addressId}': {
    put: h.operation({
      tag: 'Addresses',
      summary: 'Update a company address',
      params: [h.numericPathParam('addressId', 'Address id.')],
      body: h.jsonBody(h.ref('AddressInput'), false),
      ok: h.objectResponse('Updated.'),
      errors: E,
      extraResponses: notFound('address'),
    }),
    delete: h.operation({
      tag: 'Addresses',
      summary: 'Delete a company address',
      params: [h.numericPathParam('addressId', 'Address id.')],
      ok: h.objectResponse('Deleted.'),
      errors: E,
      extraResponses: notFound('address'),
    }),
  },

  /* ---------------------------------------------------- category products */
  '/category_products/': {
    get: h.operation({
      tag: 'Categories',
      summary: 'List product categories',
      ok: h.listResponse('Categories.'),
      errors: E,
    }),
    post: h.operation({
      tag: 'Categories',
      summary: 'Create a category, or a product inside one',
      description: 'Supplying `category_id` creates a product under that category.',
      body: h.jsonBody({
        type: 'object',
        properties: {
          name: { type: 'string', example: 'Imaging' },
          category_id: { type: 'integer', description: 'Set to create a product, omit for a category.' },
        },
        required: ['name'],
      }),
      ok: h.objectResponse('Created.'),
      status: 201,
      errors: E,
    }),
  },
  '/category_products/{categoryId}': {
    delete: h.operation({
      tag: 'Categories',
      summary: 'Delete a category',
      params: [h.numericPathParam('categoryId', 'Category id.')],
      ok: h.objectResponse('Deleted.'),
      errors: E,
      extraResponses: notFound('category'),
    }),
  },
  '/category_products/{categoryId}/products': {
    get: h.operation({
      tag: 'Categories',
      summary: 'Products in a category',
      params: [h.numericPathParam('categoryId', 'Category id.')],
      ok: h.listResponse('Products.'),
      errors: E,
    }),
  },
  '/category_products/products/{productId}': {
    delete: h.operation({
      tag: 'Categories',
      summary: 'Delete a product',
      params: [h.numericPathParam('productId', 'Product id.')],
      ok: h.objectResponse('Deleted.'),
      errors: E,
      extraResponses: notFound('product'),
    }),
  },

  /* ----------------------------------------------------------- collection */
  '/collections': {
    get: h.operation({
      tag: 'Collections',
      summary: "List the signed-in user's collections",
      ok: h.listResponse('Collections, each with its companies.'),
      errors: E,
    }),
    post: h.operation({
      tag: 'Collections',
      summary: 'Create a collection',
      body: h.jsonBody({
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', example: 'Watchlist' },
          companies: h.jsonArrayField('Company ids to seed the collection with.'),
        },
      }),
      ok: h.objectResponse('Created.'),
      status: 201,
      errors: E,
    }),
  },
  '/collections/{collectionId}': {
    put: h.operation({
      tag: 'Collections',
      summary: 'Rename a collection or replace its companies',
      params: [h.numericPathParam('collectionId', 'Collection id.')],
      body: h.jsonBody({
        type: 'object',
        properties: { name: { type: 'string' }, companies: h.jsonArrayField('Company ids.') },
      }, false),
      ok: h.objectResponse('Updated.'),
      errors: E,
      extraResponses: notFound('collection'),
    }),
    delete: h.operation({
      tag: 'Collections',
      summary: 'Delete a collection',
      params: [h.numericPathParam('collectionId', 'Collection id.')],
      ok: h.objectResponse('Deleted.'),
      errors: E,
      extraResponses: notFound('collection'),
    }),
  },

  /* -------------------------------------------------------- professionals */
  '/professionals/': {
    get: h.operation({
      tag: 'Professionals',
      summary: 'List professionals',
      ok: h.listResponse('Professionals.'),
      errors: E,
    }),
    post: h.operation({
      tag: 'Professionals',
      summary: 'Create a professional',
      body: h.jsonBody(h.ref('ProfessionalInput')),
      ok: h.objectResponse('Created.'),
      status: 201,
      errors: E,
    }),
  },
  '/professionals/{professionalId}': {
    put: h.operation({
      tag: 'Professionals',
      summary: 'Update a professional',
      params: [h.numericPathParam('professionalId', 'Professional id.')],
      body: h.jsonBody(h.ref('ProfessionalInput'), false),
      ok: h.objectResponse('Updated.'),
      errors: E,
      extraResponses: notFound('professional'),
    }),
    delete: h.operation({
      tag: 'Professionals',
      summary: 'Delete a professional',
      params: [h.numericPathParam('professionalId', 'Professional id.')],
      ok: h.objectResponse('Deleted.'),
      errors: E,
      extraResponses: notFound('professional'),
    }),
  },

  /* ------------------------------------------------------------- comments */
  '/comments/{subjectType}': {
    get: h.operation({
      tag: 'Comments',
      summary: 'List comments of one subject type',
      params: [h.numericPathParam('subjectType', 'Subject type id.')],
      ok: h.listResponse('Comments.'),
      errors: E,
    }),
    post: h.operation({
      tag: 'Comments',
      summary: 'Post a comment',
      description: 'Accepts an optional `file` attachment as multipart/form-data.',
      params: [h.numericPathParam('subjectType', 'Subject type id.')],
      body: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              properties: {
                subject: { type: 'string', description: 'The thing being commented on.' },
                comment: { type: 'string' },
                file: { type: 'string', format: 'binary' },
              },
              required: ['comment'],
            },
          },
        },
      },
      ok: h.objectResponse('Created.'),
      status: 201,
      errors: E,
    }),
  },
  '/comments/{subjectType}/{subject}': {
    get: h.operation({
      tag: 'Comments',
      summary: 'Comments on one subject',
      params: [
        h.numericPathParam('subjectType', 'Subject type id.'),
        h.pathParam('subject', 'Subject identifier.'),
      ],
      ok: h.listResponse('Comments.'),
      errors: E,
    }),
  },
  '/comments/{ID}': {
    put: h.operation({
      tag: 'Comments',
      summary: 'Edit a comment',
      params: [h.numericPathParam('ID', 'Comment id.')],
      body: h.jsonBody({ type: 'object', properties: { comment: { type: 'string' } } }),
      ok: h.objectResponse('Updated.'),
      errors: E,
      extraResponses: notFound('comment'),
    }),
    delete: h.operation({
      tag: 'Comments',
      summary: 'Delete a comment',
      params: [h.numericPathParam('ID', 'Comment id.')],
      ok: h.objectResponse('Deleted.'),
      errors: E,
      extraResponses: notFound('comment'),
    }),
  },

  /* ----------------------------------------------------------- activities */
  '/activities': {
    get: h.operation({
      tag: 'Activities',
      summary: 'List activities',
      params: [
        h.queryParam('type', 'Activity type filter.', { type: 'integer' }),
        ...h.paginationParams,
      ],
      ok: h.listResponse('Activities.'),
      errors: E,
    }),
  },
  '/activities/{id}': {
    get: h.operation({
      tag: 'Activities',
      summary: 'One activity',
      params: [h.numericPathParam('id', 'Activity id.')],
      ok: h.objectResponse('The activity.'),
      errors: E,
      extraResponses: notFound('activity'),
    }),
    put: h.operation({
      tag: 'Activities',
      summary: 'Update an activity',
      params: [h.numericPathParam('id', 'Activity id.')],
      body: h.jsonBody(h.ref('ActivityInput'), false),
      ok: h.objectResponse('Updated.'),
      errors: E,
      extraResponses: notFound('activity'),
    }),
  },
  '/activities/{type}': {
    post: h.operation({
      tag: 'Activities',
      summary: 'Create an activity',
      description: 'Accepts an optional `upload_file` attachment as multipart/form-data.',
      params: [h.numericPathParam('type', 'Activity type.')],
      body: {
        required: true,
        content: {
          'multipart/form-data': { schema: h.ref('ActivityInput') },
          'application/json': { schema: h.ref('ActivityInput') },
        },
      },
      ok: h.objectResponse('Created.'),
      status: 201,
      errors: E,
    }),
  },
  '/activities/{type}/{option}': {
    get: h.operation({
      tag: 'Activities',
      summary: 'Activities filtered by type and option',
      params: [
        h.numericPathParam('type', 'Activity type.'),
        h.pathParam('option', 'Option discriminator, e.g. a professional or document id.'),
      ],
      ok: h.listResponse('Activities.'),
      errors: E,
    }),
  },
  '/activities/comments/{subject_type}/{subject}': {
    get: h.operation({
      tag: 'Activities',
      summary: 'Comments attached to an activity subject',
      params: [
        h.numericPathParam('subject_type', 'Subject type id.'),
        h.pathParam('subject', 'Subject identifier.'),
      ],
      ok: h.listResponse('Comments.'),
      errors: E,
    }),
  },

  /* ----------------------------------------------------------- selections */
  '/user_company_selection': {
    get: h.operation({
      tag: 'Selections',
      summary: "The user's saved company selection",
      ok: h.objectResponse('The selection.'),
    }),
    post: h.operation({
      tag: 'Selections',
      summary: 'Save the company selection',
      body: h.jsonBody({
        type: 'object',
        properties: { companies: h.jsonArrayField('Selected company ids.') },
      }),
      ok: h.objectResponse('Saved.'),
    }),
  },
  '/user_activity_selection': {
    get: h.operation({
      tag: 'Selections',
      summary: "The user's saved activity selection",
      ok: h.objectResponse('The selection.'),
    }),
    post: h.operation({
      tag: 'Selections',
      summary: 'Save the activity selection',
      body: h.jsonBody({
        type: 'object',
        properties: { activities: h.jsonArrayField('Selected activity ids.', '[1,6]') },
      }),
      ok: h.objectResponse('Saved.'),
    }),
    put: h.operation({
      tag: 'Selections',
      summary: 'Clear the activity selection',
      body: h.jsonBody({
        type: 'object',
        properties: { activities: h.jsonArrayField('Activity ids to clear.', '[1,6]') },
      }),
      ok: h.objectResponse('Cleared.'),
    }),
  },

  /* --------------------------------------------------------------- charts */
  '/charts/{type}': {
    get: h.operation({
      tag: 'Charts',
      summary: 'Chart data by type',
      params: [
        h.pathParam('type', 'Chart type, 1-5.', { type: 'integer', minimum: 1, maximum: 5, example: 1 }),
        h.jsonArrayQuery('companies', 'Representative ids.'),
      ],
      ok: h.objectResponse('The chart series.'),
      errors: E,
    }),
  },
};
