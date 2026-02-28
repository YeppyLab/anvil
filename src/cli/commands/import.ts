import * as fs from 'fs';
import * as path from 'path';
import { parseArgs } from './parse-args';
import { parseOpenAPISpec } from '../../lib/parser/swagger';
import { parsePostmanCollection } from '../../lib/parser/postman';
import { loadConfig } from '../../lib/config';

export async function importSpec(args: string[]): Promise<void> {
  const opts = parseArgs(args);
  const outputDir = opts.output || resolveKnowledgeDir();

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  if (opts.postman) {
    await importFile(opts.postman, 'postman', outputDir);
  } else if (opts.openapi) {
    await importFile(opts.openapi, 'openapi', outputDir);
  } else {
    console.log('Usage: anvil import --postman <file> | --openapi <file> [--output <dir>]');
  }
}

async function importFile(filePath: string, type: 'postman' | 'openapi', outputDir: string): Promise<void> {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    console.error(`❌ File not found: ${resolved}`);
    process.exit(1);
  }

  const icon = type === 'postman' ? '📦' : '📄';
  console.log(`${icon} Parsing ${type === 'postman' ? 'Postman collection' : 'OpenAPI spec'}: ${resolved}`);

  try {
    const markdown =
      type === 'postman'
        ? await parsePostmanCollection(resolved)
        : await parseOpenAPISpec(resolved);

    const baseName = path.basename(resolved, path.extname(resolved));
    const outputFile = path.join(outputDir, `${baseName}.md`);
    fs.writeFileSync(outputFile, markdown, 'utf-8');
    console.log(`✅ Knowledge base written to: ${outputFile}`);
    console.log(`   ${markdown.split('\n').length} lines, ${(markdown.length / 1024).toFixed(1)}KB`);
  } catch (err: any) {
    console.error(`❌ Failed to parse: ${err.message}`);
    process.exit(1);
  }
}

function resolveKnowledgeDir(): string {
  try {
    const config = loadConfig();
    return config.knowledge.dir;
  } catch {
    return path.resolve(process.cwd(), 'knowledge');
  }
}
