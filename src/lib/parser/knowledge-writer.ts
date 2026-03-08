import * as fs from 'fs';
import * as path from 'path';
import { StructuredKnowledge } from './types';

/** Write structured knowledge as JSON files to the output directory */
export function writeStructuredKnowledge(knowledge: StructuredKnowledge, outputDir: string): void {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // endpoints.json
  fs.writeFileSync(
    path.join(outputDir, 'endpoints.json'),
    JSON.stringify(knowledge.endpoints, null, 2),
    'utf-8',
  );

  // auth.json
  fs.writeFileSync(
    path.join(outputDir, 'auth.json'),
    JSON.stringify(knowledge.auth, null, 2),
    'utf-8',
  );

  // schemas.json
  fs.writeFileSync(
    path.join(outputDir, 'schemas.json'),
    JSON.stringify(knowledge.schemas, null, 2),
    'utf-8',
  );

  // info.json (servers + info)
  fs.writeFileSync(
    path.join(outputDir, 'info.json'),
    JSON.stringify({ info: knowledge.info, servers: knowledge.servers }, null, 2),
    'utf-8',
  );
}

/** Load structured knowledge from JSON files in the knowledge directory */
export function loadStructuredKnowledge(knowledgeDir: string): StructuredKnowledge | null {
  try {
    const endpointsPath = path.join(knowledgeDir, 'endpoints.json');
    if (!fs.existsSync(endpointsPath)) return null;

    const endpoints = JSON.parse(fs.readFileSync(endpointsPath, 'utf-8'));
    const auth = safeReadJson(path.join(knowledgeDir, 'auth.json'), []);
    const schemas = safeReadJson(path.join(knowledgeDir, 'schemas.json'), {});
    const infoData = safeReadJson(path.join(knowledgeDir, 'info.json'), { info: { title: 'API' }, servers: [] });

    return {
      endpoints,
      auth,
      schemas,
      servers: infoData.servers || [],
      info: infoData.info || { title: 'API' },
    };
  } catch {
    return null;
  }
}

function safeReadJson(filePath: string, fallback: any): any {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return fallback;
  }
}
