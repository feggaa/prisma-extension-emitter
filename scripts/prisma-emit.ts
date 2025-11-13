#!/usr/bin/env ts-node
import { resolve, dirname } from 'path'
import yargs from 'yargs'
import { generateTypes } from '../src/generator'

async function main() {
  const argv = await yargs()
    .option('schema', {
      alias: 's',
      type: 'string',
      description: 'Path to your schema.prisma',
      default: 'prisma/schema.prisma',
    })
    .help()
    .parseAsync()

  const schemaPath = resolve(process.cwd(), argv.schema)
  const outDir = resolve(dirname(schemaPath), 'generated/prisma')
  
  console.log(`Schema: ${schemaPath}`)
  console.log(`Output: ${outDir}`)
  console.log('')
  
  await generateTypes({ schemaPath, outDir })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
