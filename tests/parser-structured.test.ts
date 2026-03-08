import { parseOpenAPIStructured } from '../src/lib/parser/swagger';
import { parsePostmanStructured } from '../src/lib/parser/postman';
import { writeStructuredKnowledge, loadStructuredKnowledge } from '../src/lib/parser/knowledge-writer';
import { buildKnowledgeSummary } from '../src/lib/agent/knowledge-injector';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const tmpDir = path.join(os.tmpdir(), 'anvil-structured-test');

beforeAll(() => fs.mkdirSync(tmpDir, { recursive: true }));
afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe('OpenAPI structured parser', () => {
  const spec = {
    openapi: '3.0.0',
    info: { title: 'Pet Store', version: '1.0.0', description: 'A sample pet store' },
    servers: [{ url: 'https://api.petstore.io/v1', description: 'Production' }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        apiKey: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
      },
      schemas: {
        Pet: {
          type: 'object',
          required: ['name'],
          properties: {
            id: { type: 'integer', format: 'int64', readOnly: true },
            name: { type: 'string', description: 'Pet name', minLength: 1, maxLength: 100 },
            status: { type: 'string', enum: ['available', 'pending', 'sold'], default: 'available' },
            tags: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
    paths: {
      '/pets': {
        get: {
          summary: 'List all pets',
          operationId: 'listPets',
          tags: ['Pets'],
          parameters: [
            { name: 'limit', in: 'query', required: false, schema: { type: 'integer' }, description: 'Max items' },
          ],
          responses: {
            '200': {
              description: 'A list of pets',
              content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Pet' } } } },
            },
          },
        },
        post: {
          summary: 'Create a pet',
          operationId: 'createPet',
          tags: ['Pets'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Pet' },
              },
            },
          },
          responses: { '201': { description: 'Created' } },
          security: [{ bearerAuth: [], apiKey: [] }],
        },
      },
      '/pets/{petId}': {
        get: {
          summary: 'Get a pet by ID',
          tags: ['Pets'],
          parameters: [{ name: 'petId', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'A pet', content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } } },
            '404': { description: 'Not found' },
          },
        },
      },
    },
  };

  let specFile: string;

  beforeAll(() => {
    specFile = path.join(tmpDir, 'petstore-structured.json');
    fs.writeFileSync(specFile, JSON.stringify(spec));
  });

  it('resolves $ref references fully', async () => {
    const k = await parseOpenAPIStructured(specFile);
    // The POST /pets requestBody should have resolved Pet schema properties
    const createPet = k.endpoints.find(e => e.method === 'POST' && e.path === '/pets');
    expect(createPet).toBeDefined();
    expect(createPet!.requestBody).toBeDefined();
    expect(createPet!.requestBody!.schema.properties).toBeDefined();
    expect(createPet!.requestBody!.schema.properties!.name).toBeDefined();
    expect(createPet!.requestBody!.schema.properties!.name.type).toBe('string');
  });

  it('extracts auth schemes', async () => {
    const k = await parseOpenAPIStructured(specFile);
    expect(k.auth).toHaveLength(2);
    const bearer = k.auth.find(a => a.name === 'bearerAuth');
    expect(bearer).toBeDefined();
    expect(bearer!.type).toBe('http');
    expect(bearer!.scheme).toBe('bearer');
    expect(bearer!.bearerFormat).toBe('JWT');

    const apiKey = k.auth.find(a => a.name === 'apiKey');
    expect(apiKey).toBeDefined();
    expect(apiKey!.type).toBe('apiKey');
    expect(apiKey!.in).toBe('header');
    expect(apiKey!.paramName).toBe('X-API-Key');
  });

  it('parses full request schemas with required, types, enums', async () => {
    const k = await parseOpenAPIStructured(specFile);
    const petSchema = k.schemas['Pet'];
    expect(petSchema).toBeDefined();
    expect(petSchema.required).toContain('name');
    expect(petSchema.properties!.status.enum).toEqual(['available', 'pending', 'sold']);
    expect(petSchema.properties!.status.default).toBe('available');
    expect(petSchema.properties!.id.format).toBe('int64');
    expect(petSchema.properties!.id.readOnly).toBe(true);
    expect(petSchema.properties!.name.minLength).toBe(1);
    expect(petSchema.properties!.name.maxLength).toBe(100);
    expect(petSchema.properties!.tags.type).toBe('array');
    expect(petSchema.properties!.tags.items!.type).toBe('string');
  });

  it('parses response schemas per status code', async () => {
    const k = await parseOpenAPIStructured(specFile);
    const getPet = k.endpoints.find(e => e.method === 'GET' && e.path === '/pets/{petId}');
    expect(getPet).toBeDefined();
    expect(getPet!.responses['200']).toBeDefined();
    expect(getPet!.responses['200'].schema).toBeDefined();
    expect(getPet!.responses['200'].schema!.properties!.name).toBeDefined();
    expect(getPet!.responses['404']).toBeDefined();
    expect(getPet!.responses['404'].description).toBe('Not found');
  });

  it('extracts base URL and server info', async () => {
    const k = await parseOpenAPIStructured(specFile);
    expect(k.servers).toHaveLength(1);
    expect(k.servers[0].url).toBe('https://api.petstore.io/v1');
    expect(k.servers[0].description).toBe('Production');
  });

  it('extracts security requirements per endpoint', async () => {
    const k = await parseOpenAPIStructured(specFile);
    // GET /pets inherits global security
    const listPets = k.endpoints.find(e => e.method === 'GET' && e.path === '/pets');
    expect(listPets!.security).toHaveLength(1);
    expect(listPets!.security[0].schemeName).toBe('bearerAuth');

    // POST /pets has its own security
    const createPet = k.endpoints.find(e => e.method === 'POST' && e.path === '/pets');
    expect(createPet!.security).toHaveLength(2);
  });

  it('extracts parameters with full details', async () => {
    const k = await parseOpenAPIStructured(specFile);
    const listPets = k.endpoints.find(e => e.method === 'GET' && e.path === '/pets');
    expect(listPets!.parameters).toHaveLength(1);
    expect(listPets!.parameters[0].name).toBe('limit');
    expect(listPets!.parameters[0].in).toBe('query');
    expect(listPets!.parameters[0].required).toBe(false);
    expect(listPets!.parameters[0].schema.type).toBe('integer');
  });
});

describe('Swagger 2.0 structured parser', () => {
  it('parses Swagger 2.0 with body params and securityDefinitions', async () => {
    const spec = {
      swagger: '2.0',
      info: { title: 'Legacy API', version: '2.0' },
      host: 'api.legacy.com',
      basePath: '/v2',
      schemes: ['https'],
      securityDefinitions: {
        api_key: { type: 'apiKey', name: 'api_key', in: 'header' },
      },
      paths: {
        '/users': {
          get: { summary: 'List users', responses: { '200': { description: 'OK' } } },
          post: {
            summary: 'Create user',
            parameters: [
              {
                name: 'body',
                in: 'body',
                required: true,
                schema: {
                  type: 'object',
                  required: ['name'],
                  properties: { name: { type: 'string' }, email: { type: 'string', format: 'email' } },
                },
              },
            ],
            responses: { '201': { description: 'Created' } },
          },
        },
      },
    };

    const file = path.join(tmpDir, 'swagger2.json');
    fs.writeFileSync(file, JSON.stringify(spec));
    const k = await parseOpenAPIStructured(file);

    expect(k.servers[0].url).toBe('https://api.legacy.com/v2');
    expect(k.auth).toHaveLength(1);
    expect(k.auth[0].type).toBe('apiKey');

    const createUser = k.endpoints.find(e => e.method === 'POST');
    expect(createUser!.requestBody).toBeDefined();
    expect(createUser!.requestBody!.schema.required).toContain('name');
    expect(createUser!.requestBody!.schema.properties!.email.format).toBe('email');
  });
});

describe('Postman structured parser', () => {
  it('parses a Postman collection into structured format', async () => {
    const collection = {
      info: { name: 'My API', description: 'Test collection', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
      variable: [{ key: 'baseUrl', value: 'https://api.example.com' }],
      auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{token}}' }] },
      item: [
        {
          name: 'Users',
          item: [
            {
              name: 'Get Users',
              request: {
                method: 'GET',
                url: { raw: '{{baseUrl}}/users', query: [{ key: 'page', value: '1', description: 'Page number' }] },
              },
              response: [{ name: 'Success', code: 200, body: '{"users": []}' }],
            },
            {
              name: 'Create User',
              request: {
                method: 'POST',
                url: '{{baseUrl}}/users',
                body: { mode: 'raw', raw: '{"name": "John", "email": "john@test.com"}' },
              },
            },
          ],
        },
      ],
    };

    const file = path.join(tmpDir, 'postman-structured.json');
    fs.writeFileSync(file, JSON.stringify(collection));
    const k = await parsePostmanStructured(file);

    expect(k.info.title).toBe('My API');
    expect(k.servers).toHaveLength(1);
    expect(k.servers[0].url).toBe('https://api.example.com');
    expect(k.auth).toHaveLength(1);
    expect(k.auth[0].scheme).toBe('bearer');
    expect(k.endpoints).toHaveLength(2);

    const getUsers = k.endpoints.find(e => e.method === 'GET');
    expect(getUsers!.parameters).toHaveLength(1);
    expect(getUsers!.parameters[0].name).toBe('page');
    expect(getUsers!.responses['200']).toBeDefined();

    const createUser = k.endpoints.find(e => e.method === 'POST');
    expect(createUser!.requestBody).toBeDefined();
    expect(createUser!.requestBody!.schema.properties!.name.type).toBe('string');
  });
});

describe('Knowledge writer/loader', () => {
  it('writes and loads structured knowledge', async () => {
    const specFile = path.join(tmpDir, 'petstore-structured.json');
    const k = await parseOpenAPIStructured(specFile);
    const outDir = path.join(tmpDir, 'knowledge-out');

    writeStructuredKnowledge(k, outDir);

    expect(fs.existsSync(path.join(outDir, 'endpoints.json'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'auth.json'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'schemas.json'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'info.json'))).toBe(true);

    const loaded = loadStructuredKnowledge(outDir);
    expect(loaded).not.toBeNull();
    expect(loaded!.endpoints).toHaveLength(k.endpoints.length);
    expect(loaded!.auth).toHaveLength(k.auth.length);
    expect(loaded!.servers).toHaveLength(k.servers.length);
  });
});

describe('Knowledge injector', () => {
  it('builds a summary from structured knowledge', async () => {
    const specFile = path.join(tmpDir, 'petstore-structured.json');
    const k = await parseOpenAPIStructured(specFile);
    const outDir = path.join(tmpDir, 'knowledge-inject');
    writeStructuredKnowledge(k, outDir);

    const summary = buildKnowledgeSummary(outDir);
    expect(summary).not.toBeNull();
    expect(summary).toContain('Pet Store');
    expect(summary).toContain('https://api.petstore.io/v1');
    expect(summary).toContain('Bearer token');
    expect(summary).toContain('GET /pets');
    expect(summary).toContain('POST /pets');
    expect(summary).toContain('GET /pets/{petId}');
  });

  it('returns null for empty knowledge dir', () => {
    const emptyDir = path.join(tmpDir, 'empty-knowledge');
    fs.mkdirSync(emptyDir, { recursive: true });
    const summary = buildKnowledgeSummary(emptyDir);
    expect(summary).toBeNull();
  });
});
