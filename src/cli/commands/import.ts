import { parseArgs } from './parse-args';

export async function importSpec(args: string[]): Promise<void> {
  const opts = parseArgs(args);

  if (opts.postman) {
    console.log(`📦 Importing Postman collection: ${opts.postman}`);
    // TODO: implement Postman parser
    console.log('⚠️  Not yet implemented');
  } else if (opts.openapi) {
    console.log(`📄 Importing OpenAPI spec: ${opts.openapi}`);
    // TODO: implement OpenAPI parser
    console.log('⚠️  Not yet implemented');
  } else {
    console.log('Usage: anvil import --postman <file> | --openapi <file>');
  }
}
