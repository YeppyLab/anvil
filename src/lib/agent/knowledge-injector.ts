import { loadStructuredKnowledge } from '../parser/knowledge-writer';
import { StructuredKnowledge } from '../parser/types';

/** Build a summary of the API knowledge to inject into the system prompt */
export function buildKnowledgeSummary(knowledgeDir: string): string | null {
  const knowledge = loadStructuredKnowledge(knowledgeDir);
  if (!knowledge || knowledge.endpoints.length === 0) return null;
  return formatKnowledgeSummary(knowledge);
}

export function formatKnowledgeSummary(k: StructuredKnowledge): string {
  const lines: string[] = [];

  lines.push(`## API: ${k.info.title}${k.info.version ? ` (v${k.info.version})` : ''}`);
  if (k.info.description) lines.push(k.info.description);

  // Servers
  if (k.servers.length) {
    lines.push('', '### Base URLs');
    for (const s of k.servers) {
      lines.push(`- ${s.url}${s.description ? ` (${s.description})` : ''}`);
    }
  }

  // Auth
  if (k.auth.length) {
    lines.push('', '### Authentication');
    for (const a of k.auth) {
      if (a.type === 'http' && a.scheme === 'bearer') {
        lines.push(`- **${a.name}**: Bearer token${a.bearerFormat ? ` (${a.bearerFormat})` : ''}`);
      } else if (a.type === 'apiKey') {
        lines.push(`- **${a.name}**: API Key in ${a.in} → \`${a.paramName}\``);
      } else if (a.type === 'oauth2') {
        lines.push(`- **${a.name}**: OAuth2`);
      } else {
        lines.push(`- **${a.name}**: ${a.type}${a.scheme ? ` (${a.scheme})` : ''}`);
      }
    }
  }

  // Endpoints summary
  lines.push('', '### Available Endpoints');
  for (const ep of k.endpoints) {
    const params = ep.parameters.filter(p => p.required).map(p => p.name);
    const paramStr = params.length ? ` [required: ${params.join(', ')}]` : '';
    const bodyStr = ep.requestBody ? ' (has body)' : '';
    const desc = ep.summary ? ` — ${ep.summary}` : '';
    lines.push(`- \`${ep.method} ${ep.path}\`${desc}${paramStr}${bodyStr}`);
  }

  return lines.join('\n');
}
