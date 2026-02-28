import * as fs from 'fs';

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
  flattenItems(collection.item || [], lines, 0);

  return lines.join('\n');
}

function flattenItems(items: PostmanItem[], lines: string[], depth: number): void {
  for (const item of items) {
    if (item.item?.length) {
      // Folder
      const hashes = '#'.repeat(Math.min(depth + 3, 6));
      lines.push('', `${hashes} ${item.name || 'Folder'}`, '');
      if (item.description) lines.push(item.description, '');
      flattenItems(item.item, lines, depth + 1);
    } else if (item.request) {
      formatRequest(item, lines);
    }
  }
}

function formatRequest(item: PostmanItem, lines: string[]): void {
  const req = item.request!;
  const method = req.method || 'GET';
  const url = typeof req.url === 'string' ? req.url : req.url?.raw || buildUrl(req.url);

  lines.push(`#### \`${method} ${url}\``);
  if (item.name) lines.push('', `**${item.name}**`);
  if (req.description) lines.push('', req.description);

  // Query params
  const queryParams = typeof req.url === 'object' ? req.url?.query?.filter(q => !q.disabled) : undefined;
  if (queryParams?.length) {
    lines.push('', '**Query Parameters:**', '');
    for (const q of queryParams) {
      lines.push(`- \`${q.key}\` = \`${q.value}\`${q.description ? ' — ' + q.description : ''}`);
    }
  }

  // Headers
  const headers = req.header?.filter(h => !h.key.toLowerCase().startsWith('content-type'));
  if (headers?.length) {
    lines.push('', '**Headers:**', '');
    for (const h of headers) {
      lines.push(`- \`${h.key}: ${h.value}\`${h.description ? ' — ' + h.description : ''}`);
    }
  }

  // Body
  if (req.body?.raw) {
    lines.push('', '**Request Body:**', '', '```json', tryPrettyJson(req.body.raw), '```');
  }

  // Auth
  if (req.auth) {
    lines.push('', formatAuth(req.auth));
  }

  // Example responses
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

function buildUrl(url: any): string {
  if (!url) return '';
  const host = Array.isArray(url.host) ? url.host.join('.') : url.host || '';
  const p = Array.isArray(url.path) ? '/' + url.path.join('/') : '';
  return `${host}${p}`;
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
