export interface Skill {
  name: string;
  description: string;
  match(scenario: string): boolean;
  execute(context: SkillContext): Promise<void>;
}

export interface SkillContext {
  baseUrl: string;
  endpoints: Endpoint[];
  variables: Record<string, unknown>;
}

export interface Endpoint {
  method: string;
  path: string;
  description?: string;
  parameters?: Record<string, unknown>;
  requestBody?: unknown;
  responses?: Record<string, unknown>;
}
