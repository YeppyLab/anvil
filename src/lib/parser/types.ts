/** Structured knowledge types for parsed API specs */

export interface ParsedEndpoint {
  method: string;
  path: string;
  summary?: string;
  description?: string;
  operationId?: string;
  tags: string[];
  parameters: ParsedParameter[];
  requestBody?: ParsedRequestBody;
  responses: Record<string, ParsedResponse>;
  security: ParsedSecurityRequirement[];
}

export interface ParsedParameter {
  name: string;
  in: 'query' | 'path' | 'header' | 'cookie';
  required: boolean;
  description?: string;
  schema: ParsedSchema;
}

export interface ParsedRequestBody {
  description?: string;
  required: boolean;
  contentType: string;
  schema: ParsedSchema;
}

export interface ParsedResponse {
  description: string;
  contentType?: string;
  schema?: ParsedSchema;
}

export interface ParsedSchema {
  type?: string;
  format?: string;
  description?: string;
  required?: string[];
  properties?: Record<string, ParsedSchema>;
  items?: ParsedSchema;
  enum?: unknown[];
  example?: unknown;
  default?: unknown;
  allOf?: ParsedSchema[];
  oneOf?: ParsedSchema[];
  anyOf?: ParsedSchema[];
  nullable?: boolean;
  readOnly?: boolean;
  writeOnly?: boolean;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
}

export interface ParsedAuthScheme {
  name: string;
  type: 'http' | 'apiKey' | 'oauth2' | 'openIdConnect' | string;
  scheme?: string; // e.g. 'bearer'
  bearerFormat?: string;
  in?: string; // for apiKey
  paramName?: string; // for apiKey
  description?: string;
  flows?: Record<string, { authorizationUrl?: string; tokenUrl?: string; scopes?: Record<string, string> }>;
}

export interface ParsedSecurityRequirement {
  schemeName: string;
  scopes: string[];
}

export interface StructuredKnowledge {
  endpoints: ParsedEndpoint[];
  auth: ParsedAuthScheme[];
  schemas: Record<string, ParsedSchema>;
  servers: Array<{ url: string; description?: string }>;
  info: { title: string; version?: string; description?: string };
}
