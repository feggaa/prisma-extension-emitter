# Prisma Emit Generator

## Overview

The `prisma-emit` generator is a CLI tool that:

1. Runs `npx prisma generate` to generate your Prisma Client
2. Patches the generated model files to add `emit?: boolean` to operation arguments
3. Generates TypeScript declaration files for backward compatibility

## Usage

### Command Line

```bash
# Use default schema location (prisma/schema.prisma)
npx prisma-emit

# Specify custom schema location
npx prisma-emit --schema=./path/to/schema.prisma
npx prisma-emit -s ./custom/prisma/schema.prisma
```

### What It Does

#### Step 1: Run Prisma Generate

The tool first runs the standard Prisma generate command:

```bash
npx prisma generate --schema=./prisma/schema.prisma
```

This generates your Prisma Client in the location specified in your schema.

#### Step 2: Patch Generated Models

After generation, the tool patches the generated model files to add `emit?: boolean` to operation arguments.

**Before patching:**

```typescript
export type UserCreateArgs<ExtArgs> = {
  select?: Prisma.UserSelect<ExtArgs> | null;
  data: Prisma.UserCreateInput;
};
```

**After patching:**

```typescript
export type UserCreateArgs<ExtArgs> = {
  select?: Prisma.UserSelect<ExtArgs> | null;
  data: Prisma.UserCreateInput;
  emit?: boolean; // ✅ Added
};
```

#### Step 3: Generate Type Declarations

Creates a `types/prisma-emit.d.ts` file with module augmentation:

```typescript
declare module "@prisma/client" {
  namespace Prisma {
    interface UserCreateArgs {
      emit?: boolean;
    }
    interface UserUpdateArgs {
      emit?: boolean;
    }
    interface UserUpsertArgs {
      emit?: boolean;
    }
  }
}
```

## Supported Operations

The tool adds `emit?: boolean` to the following operation types:

- ✅ `Create` - Single record creation
- ✅ `CreateMany` - Bulk record creation
- ✅ `Update` - Single record update
- ✅ `UpdateMany` - Bulk record updates
- ✅ `Upsert` - Insert or update

## Model File Locations

The tool searches for generated models in these locations (in order):

1. `./generated/prisma/models/` (custom output)
2. `./node_modules/.prisma/client/models/` (default location)
3. `../generated/prisma/models/` (parent directory)

## Example Workflow

### 1. Define Your Schema

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client"
  output   = "./generated/prisma"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id    Int     @id @default(autoincrement())
  email String  @unique
  name  String?
}
```

### 2. Run the Generator

```bash
npx prisma-emit --schema=./prisma/schema.prisma
```

**Output:**

```
Running prisma generate...
✔ Generated Prisma Client (6.19.0) to ./generated/prisma in 64ms
✅ Prisma generate completed

Patching generated models...
Found models directory: /path/to/generated/prisma/models
✅ Patched User.ts

✅ Generated /path/to/types/prisma-emit.d.ts
```

### 3. Use in Your Code

```typescript
import { PrismaClient } from "./generated/prisma/client";
import { listenerExtensionConfig } from "prisma-extension-emitter";

const prisma = new PrismaClient().$extends(
  listenerExtensionConfig({
    emit: true,
    mqtt: {
      /* ... */
    },
  })
);

// Now you can use emit!
const user = await prisma.user.create({
  data: { email: "test@example.com" },
  emit: true, // ✅ TypeScript knows about this
});
```

## Integration with Extension

The generator works seamlessly with the `prisma-extension-emitter`:

```typescript
import { prismaEventListener } from "prisma-extension-emitter";

// Listen to events
prismaEventListener("user", {
  listener: async ({ result }) => {
    console.log("User created:", result);
  },
});

// Trigger events
await prisma.user.create({
  data: { email: "user@example.com" },
  emit: true, // This triggers the listener
});
```

## Programmatic Usage

You can also use the generator programmatically:

```typescript
import { generateTypes } from "prisma-extension-emitter/dist/generator";

await generateTypes({
  schemaPath: "./prisma/schema.prisma",
  outDir: "./types",
});
```

## How Patching Works

The tool uses regex to find and modify type definitions:

1. **Locate type definitions:** `export type UserCreateArgs<...> = { ... }`
2. **Check if emit exists:** Skip if already patched
3. **Add emit field:** Insert `emit?: boolean` before the closing brace
4. **Write back:** Save the modified file

### Regex Pattern

```typescript
const typePattern = new RegExp(
  `(export type ${modelName}${op}Args<[^>]+> = \\{[^}]*?)(\\n\\})`,
  "g"
);

content = content.replace(typePattern, "$1\n  emit?: boolean$2");
```

## Safety Features

- ✅ **Idempotent:** Running multiple times won't duplicate `emit` fields
- ✅ **Non-destructive:** Only adds the `emit` field, doesn't modify other code
- ✅ **Graceful fallback:** Warns if models directory not found, continues anyway
- ✅ **Preserves formatting:** Maintains original indentation and structure

## Troubleshooting

### Models Not Found

If you see: `⚠️  Could not find generated models directory, skipping patching`

**Solution:** Make sure your Prisma schema has the correct output path:

```prisma
generator client {
  provider = "prisma-client"
  output   = "./generated/prisma"  // ← Must exist
}
```

### Emit Field Not Working

If TypeScript doesn't recognize `emit`:

1. Check that `types/prisma-emit.d.ts` was generated
2. Ensure it's included in your `tsconfig.json`:
   ```json
   {
     "include": ["src/**/*", "types/**/*"]
   }
   ```
3. Restart your TypeScript server

### Permission Errors

If patching fails with permission errors:

```bash
# Make sure you have write access
chmod +w generated/prisma/models/*.ts
```

## CI/CD Integration

Add to your build pipeline:

```json
{
  "scripts": {
    "postinstall": "npx prisma-emit",
    "generate": "npx prisma-emit",
    "build": "npx prisma-emit && tsc"
  }
}
```

## Comparison: Before vs After

### Before (Manual Type Declarations)

```typescript
// You had to maintain separate .d.ts files
declare module "@prisma/client" {
  namespace Prisma {
    interface UserCreateArgs {
      emit?: boolean;
    }
    // ... repeat for every model and operation
  }
}
```

### After (Automatic Patching)

```bash
# Just run once
npx prisma-emit

# Or add to package.json
npm run generate
```

The tool automatically:

- ✅ Generates Prisma Client
- ✅ Patches all models
- ✅ Creates type declarations
- ✅ Keeps everything in sync

## Benefits

1. **Type Safety:** Full TypeScript support for `emit` parameter
2. **Automatic:** No manual type maintenance
3. **Comprehensive:** Covers all operations (create, update, upsert, etc.)
4. **Future-Proof:** Works with any Prisma models you add
5. **Clean:** No need for `@ts-ignore` comments

## See Also

- [REFACTORING.md](./REFACTORING.md) - Code structure
- [MQTT_USAGE.md](./MQTT_USAGE.md) - MQTT integration
- [REMOTE_LISTENERS.md](./REMOTE_LISTENERS.md) - Remote event handling
