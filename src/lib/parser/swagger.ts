import * as fs from 'fs';
import * as path from 'path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const SwaggerParser = require('swagger-parser');

interface OpenAPISpec {
  openapi?: string;
  swagger?: string;
  info?: { title?: string; description?: string; version?: string };
  servers?: Array<{ url: string; description?: string }>;
  host?: string;
  basePath?: string;
  paths?: Record<string, Record<string, OperationObject>>;
  components?: { schemas?: Record<string, SchemaObject>; securitySchemes?: Record<string, any> };
  securityDefinitions?: Record<string, any>;
}

interface OperationObject {
  summary?: string;
  description?: string;
  operationId?: string;
  parameters?: ParameterObject[];
  requestBody?: { description?: string; required?: boolean; content?: Record<string, { schema?: SchemaObject }> };
  responses?: Record<string, { description?: string; content?: Record<string, { schema?: SchemaObject }> }>;
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
}

export async function parseOpenAPISpec(filePath: string): Promise<string> {
  const api = (await SwaggerParser.dereference(filePath)) as OpenAPISpec;
  const lines: string[] = [];

  // Header
  const title = api.info?.title || path.basename(filePath);
  lines.push(`# ${title}`);
  if (api.info?.description) lines.push('', api.info.description);
  if (api.info?.version) lines.push('', `**Version:** ${api.info.version}`);

  // Base URL
  if (api.servers?.length) {
    lines.push('', '## Base URL', '');
    for (const s of api.servers) {
      lines.push(`- \`${s.url}\`${s.description ? ` — ${s.description}` : ''}`);
    }
  } else if (api.host) {
    const scheme = (api as any).schemes?.[0] || 'https';
    lines.push('', '## Base URL', '', `- \`${scheme}://${api.host}${api.basePath || ''}\``);
  }

  // Auth
  const secSchemes = api.components?.securitySchemes || api.securityDefinitions;
  if (secSchemes) {
    lines.push('', '## Authentication', '');
    for (const [name, scheme] of Object.entries(secSchemes)) {
      const s = scheme as any;
      if (s.type === 'http' || s.type === 'bearer') {
        lines.push(`- **${name}**: Bearer token in \`Authorization\` header`);
      } else if (s.type === 'apiKey') {
        lines.push(`- **${name}**: API key in \`${s.in}\` → \`${s.name}\``);
      } else if (s.type === 'oauth2') {
        lines.push(`- **${name}**: OAuth2`);
      } else {
        lines.push(`- **${name}**: ${s.type || 'unknown'}`);
      }
    }
  }

  // Endpoints grouped by tag
  if (api.paths) {
    const byTag = new Map<string, string[]>();

    for (const [urlPath, methods] of Object.entries(api.paths)) {
      for (const [method, op] of Object.entries(methods)) {
        if (['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].indexOf(method) === -1) continue;
        const operation = op as OperationObject;
        const tag = operation.tags?.[0] || 'Default';
        if (!byTag.has(tag)) byTag.set(tag, []);
        byTag.get(tag)!.push(formatEndpoint(method, urlPath, operation));
      }
    }

    lines.push('', '## Endpoints');
    for (const [tag, endpoints] of byTag) {
      lines.push('', `### ${tag}`, '');
      lines.push(...endpoints);
    }
  }

  // Schemas
  if (api.components?.schemas) {
    lines.push('', '## Schemas', '');
    for (const [name, schema] of Object.entries(api.components.schemas)) {
      lines.push(`### ${name}`, '');
      lines.push(formatSchema(schema, 0));
      lines.push('');
    }
  }

  return lines.join('\n');
}

function formatEndpoint(method: string, urlPath: string, op: OperationObject): string {
  const lines: string[] = [];
  lines.push(`#### \`${method.toUpperCase()} ${urlPath}\``);
  if (op.summary) lines.push('', op.summary);
  if (op.description && op.description !== op.summary) lines.push('', op.description);

  // Parameters
  const params = op.parameters?.filter(p => p.in !== 'body');
  if (params?.length) {
    lines.push('', '**Parameters:**', '');
    for (const p of params) {
      const req = p.required ? '*(required)*' : '*(optional)*';
      const type = p.schema?.type || p.type || 'string';
      lines.push(`- \`${p.name}\` (${p.in}, ${type}) ${req}${p.description ? ' — ' + p.description : ''}`);
    }
  }

  // Request body
  if (op.requestBody?.content) {
    const jsonContent = op.requestBody.content['application/json'];
    if (jsonContent?.schema) {
      lines.push('', '**Request Body** (application/json):', '');
      lines.push(formatSchema(jsonContent.schema, 0));
    }
  }
  // Swagger 2.0 body param
  const bodyParam = op.parameters?.find(p => p.in === 'body');
  if (bodyParam?.schema) {
    lines.push('', '**Request Body:**', '');
    lines.push(formatSchema(bodyParam.schema as SchemaObject, 0));
  }

  // Responses
  if (op.responses) {
    lines.push('', '**Responses:**', '');
    for (const [code, resp] of Object.entries(op.responses)) {
      const r = resp as any;
      lines.push(`- \`${code}\`: ${r.description || ''}`);
      const jsonResp = r.content?.['application/json']?.schema || r.schema;
      if (jsonResp) {
        lines.push(formatSchema(jsonResp, 1));
      }
    }
  }

  lines.push('');
  return lines.join('\n');
}

function formatSchema(schema: SchemaObject, indent: number): string {
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
      if (prop.properties) lines.push(formatSchema(prop, indent + 1));
      if (prop.items?.properties) lines.push(formatSchema(prop.items, indent + 1));
    }
    return lines.join('\n');
  }

  if (schema.type === 'array' && schema.items) {
    return `${pad}Array of:\n${formatSchema(schema.items, indent + 1)}`;
  }

  return `${pad}Type: \`${schema.type || 'any'}\`${schema.format ? ` (${schema.format})` : ''}${schema.description ? ' — ' + schema.description : ''}`;
}
