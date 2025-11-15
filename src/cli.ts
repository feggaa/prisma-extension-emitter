#!/usr/bin/env node
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { generateTypes } from './generator';

async function main() {
  const argv = yargs(hideBin(process.argv))
    .version('2.1.12')
    .alias('v', 'version')
    .command(
      'generate',
      'Generate prisma-emit type augmentations',
      (yargs) => yargs
        .option('schema', { alias: 's', type: 'string', default: 'prisma/schema.prisma' })
        .option('output', { alias: 'o', type: 'string', default: 'types' })
    )
    .demandCommand(1, 'You need to specify a command. Use --help to see available commands.')
    .help()
    .alias('h', 'help')
    .parseSync();

  const schemaPath = String(argv.schema);
  const outDir = String(argv.output);

  if (argv._.includes('generate')) {
    await generateTypes({ schemaPath, outDir });
    console.log('✅ prisma-emit types generated');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
