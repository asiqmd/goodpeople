const uuid = { type: 'string', format: 'uuid' };
const page = (item: object) => ({
  type: 'object',
  additionalProperties: false,
  required: ['data', 'page'],
  properties: {
    data: { type: 'array', items: item },
    page: {
      type: 'object',
      additionalProperties: false,
      required: ['next_cursor', 'has_more'],
      properties: { next_cursor: { type: ['string', 'null'] }, has_more: { type: 'boolean' } },
    },
  },
});
const employee = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'company_id'],
  properties: {
    id: uuid,
    company_id: uuid,
    employee_code: { type: ['string', 'null'] },
    display_name: { type: 'string' },
    employment_status: { type: 'string' },
    job: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'site_id', 'unit_id', 'designation_id', 'effective_from'],
      properties: {
        id: uuid,
        site_id: { ...uuid, type: ['string', 'null'] },
        unit_id: { ...uuid, type: ['string', 'null'] },
        designation_id: { ...uuid, type: ['string', 'null'] },
        effective_from: { type: 'string', format: 'date' },
      },
    },
  },
};
const parameters = [
  {
    in: 'query',
    name: 'limit',
    schema: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
  },
  { in: 'query', name: 'cursor', schema: { type: 'string' } },
  { in: 'query', name: 'company_id', schema: uuid },
];
const response = (schema: object) => {
  const headers = {
    'X-Request-ID': { schema: { type: 'string' } },
    'X-RateLimit-Limit': { schema: { type: 'integer' } },
    'X-RateLimit-Remaining': { schema: { type: 'integer' } },
    'X-RateLimit-Reset': {
      description: 'Unix seconds at fixed-window reset',
      schema: { type: 'integer' },
    },
  };
  const errors = {
    400: 'Invalid filter or cursor; restart pagination',
    401: 'Expired, wrong-audience, rotated or revoked token',
    403: 'Current scope, owner, company or feature does not permit access',
    404: 'Resource not found or outside current authority',
    429: 'Retry after Retry-After; per-client fixed-window quota',
    503: 'Shared security state temporarily unavailable; retry with backoff',
  };
  return {
    '200': {
      description: 'Approved fields only; absent optional fields were not granted',
      headers,
      content: { 'application/json': { schema } },
    },
    ...Object.fromEntries(
      Object.entries(errors).map(([status, description]) => [
        status,
        {
          description,
          headers: {
            'X-Request-ID': headers['X-Request-ID'],
            ...(status === '429' ? { 'Retry-After': { schema: { type: 'integer' } } } : {}),
          },
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
      ]),
    ),
  };
};
const endpoint = (scope: string, schema: object, extra: object[] = []) => ({
  get: {
    security: [{ clientCredentials: [scope] }],
    parameters: [...parameters, ...extra],
    responses: response(page(schema)),
  },
});
export const PUBLIC_OPENAPI = {
  openapi: '3.1.0',
  info: {
    title: 'Good People Public API',
    version: '1.0.0',
    description:
      'Read-only v1. UUID IDs, ISO dates. No private identity, bank, contact, pay, HR-case, survey or payroll resources. Optional fields require explicit field grants. Cursors expire after 15 minutes and bind client, filters and current authority; pages are not a database snapshot. Reconcile by stable ID. Breaking v1 changes require at least 180 days of supported overlap and customer notice.',
  },
  servers: [{ url: '/public/v1' }],
  components: {
    securitySchemes: {
      clientCredentials: {
        type: 'oauth2',
        flows: {
          clientCredentials: {
            tokenUrl: '/oauth/token',
            scopes: {
              'org:read': 'Scoped organisation',
              'employees:read': 'Approved directory fields',
              'attendance:read': 'Processed day summaries',
            },
          },
        },
      },
    },
    schemas: {
      Employee: employee,
      Error: {
        type: 'object',
        additionalProperties: false,
        required: ['error'],
        properties: {
          error: {
            type: 'object',
            additionalProperties: false,
            required: ['code', 'message', 'request_id'],
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
              request_id: { type: 'string' },
            },
          },
        },
      },
    },
  },
  paths: {
    '/companies': endpoint('org:read', {
      type: 'object',
      additionalProperties: false,
      required: ['id'],
      properties: { id: uuid, code: { type: ['string', 'null'] }, name: { type: 'string' } },
    }),
    '/sites': endpoint('org:read', {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'company_id'],
      properties: {
        id: uuid,
        company_id: uuid,
        code: { type: ['string', 'null'] },
        name: { type: 'string' },
      },
    }),
    '/units': endpoint('org:read', {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'company_id', 'parent_id'],
      properties: {
        id: uuid,
        company_id: uuid,
        parent_id: { ...uuid, type: ['string', 'null'] },
        code: { type: ['string', 'null'] },
        name: { type: 'string' },
      },
    }),
    '/designations': endpoint('org:read', {
      type: 'object',
      additionalProperties: false,
      required: ['id'],
      properties: { id: uuid, code: { type: ['string', 'null'] }, name: { type: 'string' } },
    }),
    '/employees': endpoint('employees:read', employee, [
      { in: 'query', name: 'status', schema: { type: 'string' } },
    ]),
    '/employees/{id}': {
      get: {
        security: [{ clientCredentials: ['employees:read'] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: uuid }],
        responses: response({ type: 'object', required: ['data'], properties: { data: employee } }),
      },
    },
    '/attendance': endpoint(
      'attendance:read',
      {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'employee_id', 'company_id', 'date', 'finalized'],
        properties: {
          id: uuid,
          employee_id: uuid,
          company_id: uuid,
          date: { type: 'string', format: 'date' },
          finalized: { type: 'boolean' },
          status: { type: 'string' },
          day_type: { type: 'string' },
          worked_minutes: { type: 'integer' },
          overtime_minutes: { type: 'integer' },
          late_minutes: { type: 'integer' },
          early_out_minutes: { type: 'integer' },
        },
      },
      [
        { in: 'query', name: 'employee_id', schema: uuid },
        { in: 'query', name: 'date_from', schema: { type: 'string', format: 'date' } },
        {
          in: 'query',
          name: 'date_to',
          schema: { type: 'string', format: 'date' },
          description: 'Range at most 93 days, through today; default previous 30 days.',
        },
      ],
    ),
  },
};
