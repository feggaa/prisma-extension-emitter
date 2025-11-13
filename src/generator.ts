import { getDMMF } from '@prisma/internals';
import { promises as fs } from 'fs';
import { resolve, dirname, join, isAbsolute, relative } from 'path';
import { execSync } from 'child_process';

/**
 * Get a concise path representation for logging
 */
function getDisplayPath(absolutePath: string): string {
  const cwd = process.cwd();
  const relativePath = relative(cwd, absolutePath);
  
  // If the relative path is shorter and doesn't start with ../, use it
  // Otherwise, show common patterns like node_modules/.prisma/client/...
  if (!relativePath.startsWith('..') && relativePath.length < absolutePath.length) {
    return relativePath;
  }
  
  // Show shortened paths for node_modules
  if (absolutePath.includes('node_modules/.prisma/client')) {
    return 'node_modules/.prisma/client/index.d.ts';
  }
  if (absolutePath.includes('node_modules/@prisma/client')) {
    return 'node_modules/@prisma/client/index.d.ts';
  }
  
  return relativePath;
}

export async function generateTypes(opts: {
  schemaPath: string;
  outDir: string;
}) {
  // Step 1: Run prisma generate first
  console.log('Running prisma generate...');
  try {
    const cmd = `npx prisma generate --schema=${opts.schemaPath}`;
    execSync(cmd, { stdio: 'inherit' });
    console.log('✅ Prisma generate completed');
  } catch (error) {
    console.error('❌ Failed to run prisma generate:', error);
    throw error;
  }

  // Step 2: Patch generated model files to add emit?: boolean
  const schema = await fs.readFile(opts.schemaPath, 'utf-8');
  const dmmf = await getDMMF({ datamodel: schema });
  const models = dmmf.datamodel.models.map((m) => m.name);

  console.log('Patching generated models...');
  await patchGeneratedModels(models, opts.outDir, opts.schemaPath, schema);
}

/**
 * Extract the output path from Prisma schema
 */
function getPrismaOutputPath(schemaContent: string, schemaPath: string): string | null {
  // Match: generator client { ... output = "..." ... }
  const generatorBlockRegex = /generator\s+client\s*\{[^}]*output\s*=\s*["']([^"']+)["'][^}]*\}/s;
  const match = schemaContent.match(generatorBlockRegex);
  
  if (match && match[1]) {
    const outputPath = match[1];
    const schemaDir = dirname(schemaPath);
    
    // If it's a relative path, resolve it relative to the schema file
    if (!isAbsolute(outputPath)) {
      return resolve(schemaDir, outputPath);
    }
    return outputPath;
  }
  
  return null;
}

/**
 * Patch generated Prisma model files to add emit?: boolean to operation args
 */
async function patchGeneratedModels(
  models: string[], 
  outDir: string, 
  schemaPath: string, 
  schemaContent: string
): Promise<void> {
  // Step 1: Try to get the output path from the Prisma schema
  const prismaOutputPath = getPrismaOutputPath(schemaContent, schemaPath);
  
  const indexDtsPaths: string[] = [];
  
  // Add the path from schema if found
  if (prismaOutputPath) {
    const displayOutputPath = getDisplayPath(prismaOutputPath);
    console.log(`📍 Detected Prisma output path: ${displayOutputPath}`);
    indexDtsPaths.push(
      join(prismaOutputPath, 'index.d.ts'),
      join(prismaOutputPath, 'client', 'index.d.ts')
    );
  }
  
  // Add standard Prisma Client paths
  indexDtsPaths.push(
    // Standard node_modules locations
    resolve(process.cwd(), 'node_modules/.prisma/client/index.d.ts'),
    resolve(process.cwd(), 'node_modules/@prisma/client/index.d.ts'),
    
    // Relative to outDir
    resolve(outDir, '../../../.prisma/client/index.d.ts'),
    resolve(outDir, '../../.prisma/client/index.d.ts'),
    
    // Custom output locations
    resolve(process.cwd(), 'generated/prisma/index.d.ts'),
    resolve(process.cwd(), 'generated/client/index.d.ts'),
    resolve(process.cwd(), '../generated/prisma/index.d.ts'),
    resolve(process.cwd(), '../../generated/prisma/index.d.ts'),
    resolve(process.cwd(), 'prisma/generated/prisma/index.d.ts'),
    resolve(process.cwd(), 'prisma/generated/client/index.d.ts'),
    
    // Relative to schema
    resolve(dirname(schemaPath), 'generated/prisma/index.d.ts'),
    resolve(dirname(schemaPath), 'generated/client/index.d.ts'),
  );

  // Try each path to find index.d.ts
  for (const indexPath of indexDtsPaths) {
    try {
      await fs.access(indexPath);
      const displayPath = getDisplayPath(indexPath);
      console.log(`✅ Found Prisma Client types: ${displayPath}`);
      const patched = await patchIndexDtsFile(indexPath, models);
      if (patched > 0) {
        console.log(`✅ Patched ${patched} operation${patched > 1 ? 's' : ''} in index.d.ts`);
        return;
      }
    } catch {
      continue;
    }
  }

  // Step 2: Fallback to individual model files (older Prisma versions or custom generators)
  console.log('⚠️  index.d.ts not found, trying individual model files...');
  
  const modelsPaths: string[] = [];
  
  // Add paths based on detected output
  if (prismaOutputPath) {
    modelsPaths.push(
      join(prismaOutputPath, 'models'),
      join(prismaOutputPath, 'client', 'models')
    );
  }
  
  modelsPaths.push(
    resolve(outDir, '../generated/prisma/models'),
    resolve(outDir, '../../generated/prisma/models'),
    resolve(process.cwd(), 'generated/prisma/models'),
    resolve(process.cwd(), 'prisma/generated/prisma/models'),
    resolve(process.cwd(), 'node_modules/.prisma/client/models'),
    resolve(dirname(schemaPath), 'generated/prisma/models'),
  );

  let modelsDir: string | null = null;
  for (const path of modelsPaths) {
    try {
      await fs.access(path);
      modelsDir = path;
      break;
    } catch {
      continue;
    }
  }

  if (!modelsDir) {
    console.warn('⚠️  Could not find generated Prisma Client files to patch');
    console.warn('    Make sure you have run `prisma generate` first');
    return;
  }

  const displayModelsPath = getDisplayPath(modelsDir);
  console.log(`✅ Found models directory: ${displayModelsPath}`);

  let totalPatched = 0;
  let totalModels = 0;
  
  for (const model of models) {
    const modelFile = resolve(modelsDir, `${model}.ts`);
    
    try {
      await fs.access(modelFile);
      const patched = await patchModelFile(modelFile, model);
      totalPatched += patched;
      totalModels++;
    } catch (error) {
      // Only show error if the models directory exists but specific model file doesn't
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        console.warn(`⚠️  Model file ${model}.ts not found in ${modelsDir}`);
      } else {
        console.warn(`⚠️  Could not patch ${model}.ts:`, (error as Error).message);
      }
    }
  }
  
  if (totalPatched > 0) {
    console.log(`✅ Patched ${totalPatched} operation${totalPatched > 1 ? 's' : ''} across ${totalModels} model${totalModels > 1 ? 's' : ''}`);
  } else if (totalModels === 0) {
    console.warn('⚠️  No model files were found to patch');
  }
}

/**
 * Patch a single model file to add emit?: boolean
 */
async function patchModelFile(filePath: string, modelName: string): Promise<number> {
  let content = await fs.readFile(filePath, 'utf-8');
  
  // Operations to patch
  const operations = ['Create', 'Update', 'Upsert', 'CreateMany', 'UpdateMany', 'UpdateManyAndReturn', 'CreateManyAndReturn'];
  
  let patchedCount = 0;
  
  for (const op of operations) {
    // Find the type definition first
    const typeStartPattern = `export type ${modelName}${op}Args<`;
    const startIndex = content.indexOf(typeStartPattern);
    
    if (startIndex === -1) {
      continue;
    }
    
    // Find the opening and closing braces
    const openBraceIndex = content.indexOf('{', startIndex);
    if (openBraceIndex === -1) continue;
    
    let braceCount = 0;
    let closeBraceIndex = -1;
    
    for (let i = openBraceIndex; i < content.length; i++) {
      if (content[i] === '{') braceCount++;
      if (content[i] === '}') {
        braceCount--;
        if (braceCount === 0) {
          closeBraceIndex = i;
          break;
        }
      }
    }
    
    if (closeBraceIndex === -1) {
      continue;
    }
    
    // Check if emit is already present WITHIN this type definition only
    const typeBody = content.substring(openBraceIndex, closeBraceIndex + 1);
    if (/\bemit\?:\s*boolean/.test(typeBody)) {
      continue;
    }
    
    // Insert emit before the closing brace
    const beforeClosing = content.substring(0, closeBraceIndex);
    const afterClosing = content.substring(closeBraceIndex);
    const emitField = '\n  /**\n   * Patched by prisma-extension-emitter\n   * @param emit - Either boolean (emit both local and remote) or object {local: boolean, remote: boolean}\n   */\n  emit?: boolean | { local: boolean; remote: boolean }\n';
    
    content = beforeClosing + emitField + afterClosing;
    patchedCount++;
  }
  
  await fs.writeFile(filePath, content, 'utf-8');
  
  return patchedCount;
}

/**
 * Patch the index.d.ts file generated by newer Prisma versions
 * This file contains all type definitions in one place
 */
async function patchIndexDtsFile(filePath: string, models: string[]): Promise<number> {
  let content = await fs.readFile(filePath, 'utf-8');
  
  // Operations to patch
  const operations = ['Create', 'Update', 'Upsert', 'CreateMany', 'UpdateMany', 'UpdateManyAndReturn', 'CreateManyAndReturn', 'Delete', 'DeleteMany'];
  
  let patchedCount = 0;
  
  for (const model of models) {
    for (const op of operations) {
      // Find patterns like: export type UserCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.InternalArgs> = {
      const patterns = [
        `export type ${model}${op}Args<`,
        `type ${model}${op}Args<`,
      ];
      
      for (const pattern of patterns) {
        let searchPos = 0;
        while (true) {
          const startIndex = content.indexOf(pattern, searchPos);
          
          if (startIndex === -1) {
            break;
          }
          
          // Find the opening brace
          const openBraceIndex = content.indexOf('{', startIndex);
          if (openBraceIndex === -1) break;
          
          let braceCount = 0;
          let closeBraceIndex = -1;
          
          for (let i = openBraceIndex; i < content.length; i++) {
            if (content[i] === '{') braceCount++;
            if (content[i] === '}') {
              braceCount--;
              if (braceCount === 0) {
                closeBraceIndex = i;
                break;
              }
            }
          }
          
          if (closeBraceIndex === -1) {
            break;
          }
          
          // Check if emit is already present WITHIN this type definition only
          const typeBody = content.substring(openBraceIndex, closeBraceIndex + 1);
          
          if (/\bemit\?:\s*boolean/.test(typeBody)) {
            searchPos = closeBraceIndex + 1;
            continue;
          }
          
          // Insert emit before the closing brace
          const beforeClosing = content.substring(0, closeBraceIndex);
          const afterClosing = content.substring(closeBraceIndex);
          const emitField = '\n    /**\n     * Emit events for this operation (added by prisma-extension-emitter)\n     * @param emit - Either boolean (emit both local and remote) or object {local: boolean, remote: boolean}\n     */\n    emit?: boolean | { local: boolean; remote: boolean }\n  ';
          
          content = beforeClosing + emitField + afterClosing;
          patchedCount++;
          
          // Adjust search position to account for inserted content
          searchPos = closeBraceIndex + emitField.length + 1;
        }
      }
    }
  }
  
  if (patchedCount > 0) {
    await fs.writeFile(filePath, content, 'utf-8');
  }
  
  return patchedCount;
}
