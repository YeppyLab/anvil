import { parseOpenAPISpec } from '../src/lib/parser/swagger';
import { parsePostmanCollection } from '../src/lib/parser/postman';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const tmpDir = path.join(os.tmpdir(), 'anvil-parser-test');

beforeAll(() => {
  fs.mkdirSync(tmpDir, { recursive: true });
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('OpenAPI parser', () => {
  it('parses a minimal OpenAPI 3.0 spec', async () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 'Pet Store', version: '1.0.0', description: 'A sample pet store' },
      servers: [{ url: 'https://api.petstore.io/v1' }],
      paths: {
        '/pets': {
          get: {
            summary: 'List all pets',
            tags: ['Pets'],
            parameters: [
              { name: 'limit', in: 'query', required: false, schema: { type: 'integer' }, description: 'Max items' },
            ],
            responses: {
              '200': { description: 'A list of pets' },
            },
          },
          post: {
            summary: 'Create a pet',
            tags: ['Pets'],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['name'],
                    properties: {
                      name: { type: 'string', description: 'Pet name' },
                      tag: { type: 'string' },
                    },
                  },
                },
              },
            },
            responses: { '201': { description: 'Created' } },
          },
        },
        '/pets/{petId}': {
          get: {
            summary: 'Get a pet by ID',
            tags: ['Pets'],
            parameters: [{ name: 'petId', in: 'path', required: true, schema: { type: 'string' } }],
            responses: { '200': { description: 'A pet' } },
          },
        },
      },
    };

    const file = path.join(tmpDir, 'petstore.json');
    fs.writeFileSync(file, JSON.stringify(spec));
    const md = await parseOpenAPISpec(file);

    expect(md).toContain('# Pet Store');
    expect(md).toContain('https://api.petstore.io/v1');
    expect(md).toContain('GET /pets');
    expect(md).toContain('POST /pets');
    expect(md).toContain('GET /pets/{petId}');
    expect(md).toContain('List all pets');
    expect(md).toContain('Pet name');
    expect(md).toContain('limit');
  });

  it('parses Swagger 2.0 spec', async () => {
    const spec = {
      swagger: '2.0',
      info: { title: 'Legacy API', version: '2.0' },
      host: 'api.legacy.com',
      basePath: '/v2',
      schemes: ['https'],
      paths: {
        '/users': {
          get: { summary: 'List users', responses: { '200': { description: 'OK' } } },
        },
      },
    };

    const file = path.join(tmpDir, 'legacy.json');
    fs.writeFileSync(file, JSON.stringify(spec));
    const md = await parseOpenAPISpec(file);

    expect(md).toContain('# Legacy API');
    expect(md).toContain('https://api.legacy.com/v2');
    expect(md).toContain('GET /users');
  });
});

describe('Postman parser', () => {
  it('parses a Postman collection', async () => {
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
                description: 'Fetch all users',
              },
              response: [
                { name: 'Success', code: 200, body: '{"users": []}' },
              ],
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

    const file = path.join(tmpDir, 'my-api.json');
    fs.writeFileSync(file, JSON.stringify(collection));
    const md = await parsePostmanCollection(file);

    expect(md).toContain('# My API');
    expect(md).toContain('{{baseUrl}}');
    expect(md).toContain('Bearer token');
    expect(md).toContain('GET {{baseUrl}}/users');
    expect(md).toContain('POST {{baseUrl}}/users');
    expect(md).toContain('Get Users');
    expect(md).toContain('Fetch all users');
    expect(md).toContain('"name": "John"');
  });
});
