import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { parse as parseYaml } from 'yaml';
import { parseArgs } from './parse-args';
import { parseOpenAPISpec, parseOpenAPIStructured } from '../../lib/parser/swagger';
import { parsePostmanCollection, parsePostmanStructured } from '../../lib/parser/postman';
import { writeStructuredKnowledge } from '../../lib/parser/knowledge-writer';
import { knowledgeToMarkdown } from '../../lib/parser/swagger';
import { loadConfig } from '../../lib/config';

export async function importSpec(args: string[]): Promise<void> {
  const opts = parseArgs(args);
  const outputDir = opts.output || resolveKnowledgeDir();

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  if (opts.postman) {
    await importSource(opts.postman, 'postman', outputDir);
  } else if (opts.openapi) {
    await importSource(opts.openapi, 'openapi', outputDir);
  } else {
    // Check for positional URL argument (first non-flag arg)
    const positional = args.find(a => !a.startsWith('--') && (a.startsWith('http://') || a.startsWith('https://')));
    if (positional) {
      await importSource(positional, 'auto', outputDir);
    } else {
      console.log('Usage: anvil import --postman <file|url> | --openapi <file|url> | <url>');
      console.log('       anvil import https://api.example.com/openapi.json');
    }
  }
}

async function importSource(source: string, type: 'postman' | 'openapi' | 'auto', outputDir: string): Promise<void> {
  let filePath: string;
  let baseName: string;

  if (source.startsWith('http://') || source.startsWith('https://')) {
    console.log(`🌐 Fetching spec from: ${source}`);
    const { tmpFile, detectedType, name } = await fetchAndDetect(source, type);
    filePath = tmpFile;
    baseName = name;
    if (type === 'auto') type = detectedType;
  } else {
    filePath = path.resolve(source);
    if (!fs.existsSync(filePath)) {
      console.error(`❌ File not found: ${filePath}`);
      process.exit(1);
    }
    baseName = path.basename(filePath, path.extname(filePath));
    if (type === 'auto') {
      type = detectFormatFromFile(filePath);
    }
  }

  const icon = type === 'postman' ? '📦' : '📄';
  console.log(`${icon} Parsing ${type === 'postman' ? 'Postman collection' : 'OpenAPI spec'}: ${filePath}`);

  try {
    // Generate structured knowledge
    const knowledge =
      type === 'postman'
        ? await parsePostmanStructured(filePath)
        : await parseOpenAPIStructured(filePath);

    // Write structured JSON
    writeStructuredKnowledge(knowledge, outputDir);
    console.log(`📊 Structured knowledge written (endpoints.json, auth.json, schemas.json)`);

    // Write markdown for human readability
    const markdown =
      type === 'postman'
        ? await parsePostmanCollection(filePath)
        : knowledgeToMarkdown(knowledge);

    const outputFile = path.join(outputDir, `${baseName}.md`);
    fs.writeFileSync(outputFile, markdown, 'utf-8');
    console.log(`✅ Knowledge base written to: ${outputFile}`);
    console.log(`   ${markdown.split('\n').length} lines, ${(markdown.length / 1024).toFixed(1)}KB`);
    console.log(`   ${knowledge.endpoints.length} endpoints, ${knowledge.auth.length} auth schemes`);
  } catch (err: any) {
    console.error(`❌ Failed to parse: ${err.message}`);
    process.exit(1);
  }
}

async function fetchAndDetect(
  url: string,
  hintType: 'postman' | 'openapi' | 'auto',
): Promise<{ tmpFile: string; detectedType: 'postman' | 'openapi'; name: string }> {
  const response = await axios.get(url, { responseType: 'text', timeout: 30000 });
  let data = response.data;
  let name = 'api-spec';

  // Try to extract a name from the URL
  const urlPath = new URL(url).pathname;
  const urlBaseName = path.basename(urlPath, path.extname(urlPath));
  if (urlBaseName && urlBaseName !== '') name = urlBaseName;

  // Parse if YAML
  let parsed: any;
  if (typeof data === 'string' && (data.trim().startsWith('{') || data.trim().startsWith('['))) {
    parsed = JSON.parse(data);
  } else if (typeof data === 'string') {
    // Might be YAML
    try {
      parsed = parseYaml(data);
    } catch {
      parsed = data;
    }
  } else {
    parsed = data;
  }

  // Auto-detect type
  let detectedType: 'postman' | 'openapi' = 'openapi';
  if (hintType !== 'auto') {
    detectedType = hintType;
  } else if (parsed?.info?.schema?.includes('postman')) {
    detectedType = 'postman';
  } else if (parsed?.openapi || parsed?.swagger || parsed?.paths) {
    detectedType = 'openapi';
  } else if (parsed?.item) {
    detectedType = 'postman';
  }

  if (parsed?.info?.title) {
    name = parsed.info.title.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
  }

  // Write to temp file
  const tmpDir = path.join(require('os').tmpdir(), 'anvil-import');
  fs.mkdirSync(tmpDir, { recursive: true });
  const ext = detectedType === 'postman' ? '.json' : '.json';
  const tmpFile = path.join(tmpDir, `${name}${ext}`);
  fs.writeFileSync(tmpFile, typeof parsed === 'object' ? JSON.stringify(parsed, null, 2) : data, 'utf-8');

  return { tmpFile, detectedType, name };
}

function detectFormatFromFile(filePath: string): 'postman' | 'openapi' {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = filePath.endsWith('.yaml') || filePath.endsWith('.yml')
      ? parseYaml(raw)
      : JSON.parse(raw);
    if (parsed?.info?.schema?.includes('postman') || parsed?.item) return 'postman';
    return 'openapi';
  } catch {
    return 'openapi';
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
