import * as fs from 'fs';
import {
  StructuredKnowledge,
  ParsedEndpoint,
  ParsedParameter,
  ParsedRequestBody,
  ParsedResponse,
  ParsedSchema,
  ParsedAuthScheme,
  ParsedSecurityRequirement,
} from './types';

interface PostmanCollection {
  info?: { name?: string; description?: string; schema?: string };
  item?: PostmanItem[];
  auth?: PostmanAuth;
  variable?: PostmanVariable[];
}

interface PostmanItem {
  name?: string;
  description?: string;
  request?: PostmanRequest;
  response?: PostmanResponse[];
  item?: PostmanItem[]; // folders
}

interface PostmanRequest {
  method?: string;
  url?: string | { raw?: string; host?: string[]; path?: string[]; query?: PostmanQuery[] };
  header?: Array<{ key: string; value: string; description?: string }>;
  body?: { mode?: string; raw?: string; formdata?: any[]; urlencoded?: any[] };
  auth?: PostmanAuth;
  description?: string;
}

interface PostmanResponse {
  name?: string;
  status?: string;
  code?: number;
  body?: string;
  header?: Array<{ key: string; value: string }>;
}

interface PostmanAuth {
  type?: string;
  bearer?: Array<{ key: string; value: string }>;
  apikey?: Array<{ key: string; value: string }>;
}

interface PostmanQuery {
  key: string;
  value: string;
  description?: string;
  disabled?: boolean;
}

interface PostmanVariable {
  key: string;
  value: string;
  description?: string;
}

/** Parse a Postman collection into structured knowledge */
export async function parsePostmanStructured(filePath: string): Promise<StructuredKnowledge> {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const collection: PostmanCollection = JSON.parse(raw);

  const info = {
    title: collection.info?.name || 'Postman Collection',
    description: collection.info?.description,
  };

  // Extract base URL from variables
  const servers: Array<{ url: string; description?: string }> = [];
  const baseUrlVar = collection.variable?.find(v => v.key === 'baseUrl' || v.key === 'base_url');
  if (baseUrlVar) {
    servers.push({ url: baseUrlVar.value, description: baseUrlVar.description });
  }

  // Auth
  const auth: ParsedAuthScheme[] = [];
  if (collection.auth) {
    auth.push(convertPostmanAuth(collection.auth, 'collection'));
  }

  // Flatten items into endpoints
  const endpoints: ParsedEndpoint[] = [];
  flattenItemsStructured(collection.item || [], endpoints, collection.auth);

  return { endpoints, auth, schemas: {}, servers, info };
}

function convertPostmanAuth(auth: PostmanAuth, name: string): ParsedAuthScheme {
  if (auth.type === 'bearer') {
    return { name, type: 'http', scheme: 'bearer' };
  }
  if (auth.type === 'apikey') {
    const keyEntry = auth.apikey?.find(e => e.key === 'key');
    const inEntry = auth.apikey?.find(e => e.key === 'in');
    return {
      name,
      type: 'apiKey',
      paramName: keyEntry?.value,
      in: inEntry?.value || 'header',
    };
  }
  return { name, type: auth.type || 'unknown' };
}

function flattenItemsStructured(
  items: PostmanItem[],
  endpoints: ParsedEndpoint[],
  collectionAuth?: PostmanAuth,
): void {
  for (const item of items) {
    if (item.item?.length) {
      flattenItemsStructured(item.item, endpoints, collectionAuth);
    } else if (item.request) {
      endpoints.push(buildPostmanEndpoint(item, collectionAuth));
    }
  }
}

function buildPostmanEndpoint(item: PostmanItem, collectionAuth?: PostmanAuth): ParsedEndpoint {
  const req = item.request!;
  const method = (req.method || 'GET').toUpperCase();
  const url = typeof req.url === 'string' ? req.url : req.url?.raw || buildUrl(req.url);

  // Extract query params
  const parameters: ParsedParameter[] = [];
  const queryParams = typeof req.url === 'object' ? req.url?.query?.filter(q => !q.disabled) : undefined;
  if (queryParams) {
    for (const q of queryParams) {
      parameters.push({
        name: q.key,
        in: 'query',
        required: false,
        description: q.description,
        schema: { type: 'string' },
      });
    }
  }

  // Request body
  let requestBody: ParsedRequestBody | undefined;
  if (req.body?.raw) {
    let schema: ParsedSchema = { type: 'string' };
    try {
      const parsed = JSON.parse(req.body.raw);
      schema = inferSchemaFromExample(parsed);
    } catch {
      // not JSON
    }
    requestBody = {
      required: true,
      contentType: 'application/json',
      schema,
    };
  }

  // Responses from examples
  const responses: Record<string, ParsedResponse> = {};
  if (item.response?.length) {
    for (const resp of item.response) {
      const code = String(resp.code || resp.status || '200');
      const response: ParsedResponse = { description: resp.name || '' };
      if (resp.body) {
        try {
          const parsed = JSON.parse(resp.body);
          response.contentType = 'application/json';
          response.schema = inferSchemaFromExample(parsed);
        } catch {
          // not JSON
        }
      }
      responses[code] = response;
    }
  }

  // Security
  const security: ParsedSecurityRequirement[] = [];
  const auth = req.auth || collectionAuth;
  if (auth?.type) {
    security.push({ schemeName: auth.type, scopes: [] });
  }

  return {
    method,
    path: url,
    summary: item.name,
    description: req.description,
    tags: [],
    parameters,
    requestBody,
    responses,
    security,
  };
}

function buildUrl(url: any): string {
  if (!url) return '';
  const host = Array.isArray(url.host) ? url.host.join('.') : url.host || '';
  const p = Array.isArray(url.path) ? '/' + url.path.join('/') : '';
  return `${host}${p}`;
}

/** Infer a schema from an example value */
function inferSchemaFromExample(value: unknown): ParsedSchema {
  if (value === null || value === undefined) return { type: 'any' };
  if (Array.isArray(value)) {
    return {
      type: 'array',
      items: value.length > 0 ? inferSchemaFromExample(value[0]) : { type: 'any' },
    };
  }
  if (typeof value === 'object') {
    const props: Record<string, ParsedSchema> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      props[k] = inferSchemaFromExample(v);
    }
    return { type: 'object', properties: props };
  }
  if (typeof value === 'number') return { type: Number.isInteger(value) ? 'integer' : 'number' };
  if (typeof value === 'boolean') return { type: 'boolean' };
  return { type: 'string' };
}

/** Parse a Postman collection and return markdown (legacy format) */
export async function parsePostmanCollection(filePath: string): Promise<string> {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const collection: PostmanCollection = JSON.parse(raw);
  const lines: string[] = [];

  const name = collection.info?.name || 'Postman Collection';
  lines.push(`# ${name}`);
  if (collection.info?.description) lines.push('', collection.info.description);

  // Variables
  if (collection.variable?.length) {
    lines.push('', '## Variables', '');
    for (const v of collection.variable) {
      lines.push(`- \`{{${v.key}}}\` = \`${v.value}\`${v.description ? ' — ' + v.description : ''}`);
    }
  }

  // Auth
  if (collection.auth) {
    lines.push('', '## Authentication', '');
    lines.push(formatAuth(collection.auth));
  }

  // Endpoints
  lines.push('', '## Endpoints');
  flattenItemsMd(collection.item || [], lines, 0);

  return lines.join('\n');
}

function flattenItemsMd(items: PostmanItem[], lines: string[], depth: number): void {
  for (const item of items) {
    if (item.item?.length) {
      const hashes = '#'.repeat(Math.min(depth + 3, 6));
      lines.push('', `${hashes} ${item.name || 'Folder'}`, '');
      if (item.description) lines.push(item.description, '');
      flattenItemsMd(item.item, lines, depth + 1);
    } else if (item.request) {
      formatRequestMd(item, lines);
    }
  }
}

function formatRequestMd(item: PostmanItem, lines: string[]): void {
  const req = item.request!;
  const method = req.method || 'GET';
  const url = typeof req.url === 'string' ? req.url : req.url?.raw || buildUrl(req.url);

  lines.push(`#### \`${method} ${url}\``);
  if (item.name) lines.push('', `**${item.name}**`);
  if (req.description) lines.push('', req.description);

  const queryParams = typeof req.url === 'object' ? req.url?.query?.filter(q => !q.disabled) : undefined;
  if (queryParams?.length) {
    lines.push('', '**Query Parameters:**', '');
    for (const q of queryParams) {
      lines.push(`- \`${q.key}\` = \`${q.value}\`${q.description ? ' — ' + q.description : ''}`);
    }
  }

  const headers = req.header?.filter(h => !h.key.toLowerCase().startsWith('content-type'));
  if (headers?.length) {
    lines.push('', '**Headers:**', '');
    for (const h of headers) {
      lines.push(`- \`${h.key}: ${h.value}\`${h.description ? ' — ' + h.description : ''}`);
    }
  }

  if (req.body?.raw) {
    lines.push('', '**Request Body:**', '', '```json', tryPrettyJson(req.body.raw), '```');
  }

  if (req.auth) {
    lines.push('', formatAuth(req.auth));
  }

  if (item.response?.length) {
    lines.push('', '**Example Responses:**', '');
    for (const resp of item.response.slice(0, 3)) {
      lines.push(`- \`${resp.code || resp.status}\` ${resp.name || ''}`);
      if (resp.body) {
        lines.push('  ```json', '  ' + tryPrettyJson(resp.body).split('\n').join('\n  '), '  ```');
      }
    }
  }

  lines.push('');
}

function formatAuth(auth: PostmanAuth): string {
  if (auth.type === 'bearer') return '**Auth:** Bearer token';
  if (auth.type === 'apikey') {
    const keyEntry = auth.apikey?.find(e => e.key === 'key');
    const inEntry = auth.apikey?.find(e => e.key === 'in');
    return `**Auth:** API Key \`${keyEntry?.value || ''}\` in ${inEntry?.value || 'header'}`;
  }
  return `**Auth:** ${auth.type || 'none'}`;
}

function tryPrettyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}
