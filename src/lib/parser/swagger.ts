import * as fs from 'fs';
import * as path from 'path';
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

// eslint-disable-next-line @typescript-eslint/no-var-requires
const SwaggerParser = require('swagger-parser');

interface OpenAPISpec {
  openapi?: string;
  swagger?: string;
  info?: { title?: string; description?: string; version?: string };
  servers?: Array<{ url: string; description?: string }>;
  host?: string;
  basePath?: string;
  schemes?: string[];
  paths?: Record<string, Record<string, OperationObject>>;
  components?: { schemas?: Record<string, SchemaObject>; securitySchemes?: Record<string, any> };
  securityDefinitions?: Record<string, any>;
  security?: any[];
}

interface OperationObject {
  summary?: string;
  description?: string;
  operationId?: string;
  parameters?: ParameterObject[];
  requestBody?: { description?: string; required?: boolean; content?: Record<string, { schema?: SchemaObject }> };
  responses?: Record<string, { description?: string; content?: Record<string, { schema?: SchemaObject }>; schema?: SchemaObject }>;
  tags?: string[];
  security?: any[];
}

interface ParameterObject {
  name: string;
  in: string;
  required?: boolean;
  description?: string;
  schema?: SchemaObject;
  type?: string;
  format?: string;
  enum?: any[];
}

interface SchemaObject {
  type?: string;
  properties?: Record<string, SchemaObject>;
  items?: SchemaObject;
  required?: string[];
  description?: string;
  enum?: any[];
  format?: string;
  $ref?: string;
  example?: any;
  allOf?: SchemaObject[];
  oneOf?: SchemaObject[];
  anyOf?: SchemaObject[];
  default?: any;
  nullable?: boolean;
  readOnly?: boolean;
  writeOnly?: boolean;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
}

/** Parse an OpenAPI/Swagger spec into structured knowledge */
export async function parseOpenAPIStructured(filePath: string): Promise<StructuredKnowledge> {
  const api = (await SwaggerParser.dereference(filePath)) as OpenAPISpec;

  const info = {
    title: api.info?.title || path.basename(filePath),
    version: api.info?.version,
    description: api.info?.description,
  };

  // Servers
  const servers: Array<{ url: string; description?: string }> = [];
  if (api.servers?.length) {
    for (const s of api.servers) {
      servers.push({ url: s.url, description: s.description });
    }
  } else if (api.host) {
    const scheme = api.schemes?.[0] || 'https';
    servers.push({ url: `${scheme}://${api.host}${api.basePath || ''}` });
  }

  // Auth schemes
  const auth = extractAuthSchemes(api.components?.securitySchemes || api.securityDefinitions);

  // Global security
  const globalSecurity = extractSecurityRequirements(api.security);

  // Schemas
  const schemas: Record<string, ParsedSchema> = {};
  if (api.components?.schemas) {
    for (const [name, schema] of Object.entries(api.components.schemas)) {
      schemas[name] = convertSchema(schema);
    }
  }

  // Endpoints
  const endpoints: ParsedEndpoint[] = [];
  if (api.paths) {
    const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];
    for (const [urlPath, pathItem] of Object.entries(api.paths)) {
      for (const [method, op] of Object.entries(pathItem)) {
        if (!methods.includes(method)) continue;
        const operation = op as OperationObject;
        endpoints.push(buildEndpoint(method, urlPath, operation, globalSecurity));
      }
    }
  }

  return { endpoints, auth, schemas, servers, info };
}

function extractAuthSchemes(secSchemes: Record<string, any> | undefined): ParsedAuthScheme[] {
  if (!secSchemes) return [];
  const result: ParsedAuthScheme[] = [];
  for (const [name, scheme] of Object.entries(secSchemes)) {
    const s = scheme as any;
    const auth: ParsedAuthScheme = { name, type: s.type || 'unknown' };
    if (s.type === 'http') {
      auth.scheme = s.scheme;
      auth.bearerFormat = s.bearerFormat;
    } else if (s.type === 'apiKey') {
      auth.in = s.in;
      auth.paramName = s.name;
    } else if (s.type === 'oauth2' && s.flows) {
      auth.flows = {};
      for (const [flowType, flow] of Object.entries(s.flows)) {
        const f = flow as any;
        auth.flows[flowType] = {
          authorizationUrl: f.authorizationUrl,
          tokenUrl: f.tokenUrl,
          scopes: f.scopes,
        };
      }
    }
    auth.description = s.description;
    result.push(auth);
  }
  return result;
}

function extractSecurityRequirements(security: any[] | undefined): ParsedSecurityRequirement[] {
  if (!security) return [];
  const result: ParsedSecurityRequirement[] = [];
  for (const req of security) {
    for (const [schemeName, scopes] of Object.entries(req)) {
      result.push({ schemeName, scopes: (scopes as string[]) || [] });
    }
  }
  return result;
}

function buildEndpoint(
  method: string,
  urlPath: string,
  op: OperationObject,
  globalSecurity: ParsedSecurityRequirement[],
): ParsedEndpoint {
  const parameters: ParsedParameter[] = [];
  for (const p of (op.parameters || []).filter(p => p.in !== 'body')) {
    parameters.push({
      name: p.name,
      in: p.in as ParsedParameter['in'],
      required: p.required || false,
      description: p.description,
      schema: convertSchema(p.schema || { type: p.type || 'string', format: p.format, enum: p.enum }),
    });
  }

  let requestBody: ParsedRequestBody | undefined;
  if (op.requestBody?.content) {
    const [contentType, media] = Object.entries(op.requestBody.content)[0] || [];
    if (contentType && media?.schema) {
      requestBody = {
        description: op.requestBody.description,
        required: op.requestBody.required || false,
        contentType,
        schema: convertSchema(media.schema),
      };
    }
  }
  // Swagger 2.0 body param
  const bodyParam = op.parameters?.find(p => p.in === 'body');
  if (!requestBody && bodyParam?.schema) {
    requestBody = {
      required: bodyParam.required || false,
      contentType: 'application/json',
      schema: convertSchema(bodyParam.schema as SchemaObject),
    };
  }

  const responses: Record<string, ParsedResponse> = {};
  if (op.responses) {
    for (const [code, resp] of Object.entries(op.responses)) {
      const r = resp as any;
      const response: ParsedResponse = { description: r.description || '' };
      const jsonSchema = r.content?.['application/json']?.schema || r.schema;
      if (jsonSchema) {
        response.contentType = 'application/json';
        response.schema = convertSchema(jsonSchema);
      }
      responses[code] = response;
    }
  }

  const security = op.security
    ? extractSecurityRequirements(op.security)
    : globalSecurity;

  return {
    method: method.toUpperCase(),
    path: urlPath,
    summary: op.summary,
    description: op.description,
    operationId: op.operationId,
    tags: op.tags || [],
    parameters,
    requestBody,
    responses,
    security,
  };
}

function convertSchema(schema: SchemaObject | undefined): ParsedSchema {
  if (!schema) return { type: 'any' };
  const result: ParsedSchema = {};
  if (schema.type) result.type = schema.type;
  if (schema.format) result.format = schema.format;
  if (schema.description) result.description = schema.description;
  if (schema.required) result.required = schema.required;
  if (schema.enum) result.enum = schema.enum;
  if (schema.example !== undefined) result.example = schema.example;
  if (schema.default !== undefined) result.default = schema.default;
  if (schema.nullable) result.nullable = schema.nullable;
  if (schema.readOnly) result.readOnly = schema.readOnly;
  if (schema.writeOnly) result.writeOnly = schema.writeOnly;
  if (schema.minimum !== undefined) result.minimum = schema.minimum;
  if (schema.maximum !== undefined) result.maximum = schema.maximum;
  if (schema.minLength !== undefined) result.minLength = schema.minLength;
  if (schema.maxLength !== undefined) result.maxLength = schema.maxLength;
  if (schema.pattern) result.pattern = schema.pattern;
  if (schema.properties) {
    result.properties = {};
    for (const [name, prop] of Object.entries(schema.properties)) {
      result.properties[name] = convertSchema(prop);
    }
  }
  if (schema.items) result.items = convertSchema(schema.items);
  if (schema.allOf) result.allOf = schema.allOf.map(s => convertSchema(s));
  if (schema.oneOf) result.oneOf = schema.oneOf.map(s => convertSchema(s));
  if (schema.anyOf) result.anyOf = schema.anyOf.map(s => convertSchema(s));
  // Infer type if has properties but no explicit type
  if (!result.type && result.properties) result.type = 'object';
  if (!result.type && result.items) result.type = 'array';
  return result;
}

/** Parse OpenAPI spec and return markdown (legacy format) */
export async function parseOpenAPISpec(filePath: string): Promise<string> {
  const knowledge = await parseOpenAPIStructured(filePath);
  return knowledgeToMarkdown(knowledge);
}

/** Convert structured knowledge to markdown */
export function knowledgeToMarkdown(k: StructuredKnowledge): string {
  const lines: string[] = [];

  lines.push(`# ${k.info.title}`);
  if (k.info.description) lines.push('', k.info.description);
  if (k.info.version) lines.push('', `**Version:** ${k.info.version}`);

  if (k.servers.length) {
    lines.push('', '## Base URL', '');
    for (const s of k.servers) {
      lines.push(`- \`${s.url}\`${s.description ? ` — ${s.description}` : ''}`);
    }
  }

  if (k.auth.length) {
    lines.push('', '## Authentication', '');
    for (const a of k.auth) {
      if (a.type === 'http' && a.scheme === 'bearer') {
        lines.push(`- **${a.name}**: Bearer token in \`Authorization\` header`);
      } else if (a.type === 'http') {
        lines.push(`- **${a.name}**: HTTP ${a.scheme}`);
      } else if (a.type === 'apiKey') {
        lines.push(`- **${a.name}**: API key in \`${a.in}\` → \`${a.paramName}\``);
      } else if (a.type === 'oauth2') {
        lines.push(`- **${a.name}**: OAuth2`);
      } else {
        lines.push(`- **${a.name}**: ${a.type}`);
      }
    }
  }

  // Group endpoints by tag
  const byTag = new Map<string, ParsedEndpoint[]>();
  for (const ep of k.endpoints) {
    const tag = ep.tags[0] || 'Default';
    if (!byTag.has(tag)) byTag.set(tag, []);
    byTag.get(tag)!.push(ep);
  }

  lines.push('', '## Endpoints');
  for (const [tag, endpoints] of byTag) {
    lines.push('', `### ${tag}`, '');
    for (const ep of endpoints) {
      lines.push(formatEndpointMd(ep));
    }
  }

  if (Object.keys(k.schemas).length) {
    lines.push('', '## Schemas', '');
    for (const [name, schema] of Object.entries(k.schemas)) {
      lines.push(`### ${name}`, '');
      lines.push(formatSchemaMd(schema, 0));
      lines.push('');
    }
  }

  return lines.join('\n');
}

function formatEndpointMd(ep: ParsedEndpoint): string {
  const lines: string[] = [];
  lines.push(`#### \`${ep.method} ${ep.path}\``);
  if (ep.summary) lines.push('', ep.summary);
  if (ep.description && ep.description !== ep.summary) lines.push('', ep.description);

  const params = ep.parameters.filter(p => (p.in as string) !== 'body');
  if (params.length) {
    lines.push('', '**Parameters:**', '');
    for (const p of params) {
      const req = p.required ? '*(required)*' : '*(optional)*';
      const type = p.schema.type || 'string';
      lines.push(`- \`${p.name}\` (${p.in}, ${type}) ${req}${p.description ? ' — ' + p.description : ''}`);
    }
  }

  if (ep.requestBody) {
    lines.push('', `**Request Body** (${ep.requestBody.contentType}):`, '');
    lines.push(formatSchemaMd(ep.requestBody.schema, 0));
  }

  if (Object.keys(ep.responses).length) {
    lines.push('', '**Responses:**', '');
    for (const [code, resp] of Object.entries(ep.responses)) {
      lines.push(`- \`${code}\`: ${resp.description}`);
      if (resp.schema) {
        lines.push(formatSchemaMd(resp.schema, 1));
      }
    }
  }

  lines.push('');
  return lines.join('\n');
}

function formatSchemaMd(schema: ParsedSchema, indent: number): string {
  const pad = '  '.repeat(indent);
  if (!schema) return `${pad}*(unknown)*`;

  if (schema.type === 'object' || schema.properties) {
    const lines: string[] = [];
    const required = new Set(schema.required || []);
    for (const [name, prop] of Object.entries(schema.properties || {})) {
      const req = required.has(name) ? ' *(required)*' : '';
      const type = prop.type || (prop.properties ? 'object' : 'any');
      const enumStr = prop.enum ? ` — enum: [${prop.enum.join(', ')}]` : '';
      const desc = prop.description ? ` — ${prop.description}` : '';
      lines.push(`${pad}- \`${name}\` (${type})${req}${enumStr}${desc}`);
      if (prop.properties) lines.push(formatSchemaMd(prop, indent + 1));
      if (prop.items?.properties) lines.push(formatSchemaMd(prop.items, indent + 1));
    }
    return lines.join('\n');
  }

  if (schema.type === 'array' && schema.items) {
    return `${pad}Array of:\n${formatSchemaMd(schema.items, indent + 1)}`;
  }

  return `${pad}Type: \`${schema.type || 'any'}\`${schema.format ? ` (${schema.format})` : ''}${schema.description ? ' — ' + schema.description : ''}`;
}
