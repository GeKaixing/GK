# AGENTS.md - Coding Guidelines for gekaixing

Next.js 16.1.6 social platform with TypeScript, Tailwind CSS v4, Prisma, Supabase. Features: posts, replies, likes, sharing, user profiles, messaging.

## Tech Stack

- **Framework**: Next.js 16.1.6 with App Router
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS v4, shadcn/ui components (new-york style)
- **Database**: PostgreSQL with Prisma 7.3 (PostgreSQL adapter)
- **Auth/Storage**: Supabase (SSR client)
- **State**: Zustand 5.x
- **Forms**: React Hook Form + Zod
- **i18n**: next-intl
- **AI**: Vercel AI SDK (OpenAI/Google models)

## Commands

```bash
# Development & Build
npm run dev              # Start dev server with Turbopack (port 3000)
npm run build            # Build for production (runs typecheck + lint)
npm run start            # Start production server

# Code Quality
npm run lint             # Run ESLint on entire codebase
npm run lint -- --fix    # Run ESLint with auto-fix
npx tsc --noEmit         # TypeScript type checking only

# Prisma commands
npx prisma generate      # Generate Prisma client
npx prisma db push       # Push schema to database
npx prisma studio        # Open Prisma database GUI
npx prisma migrate dev   # Create migration
```

No unit tests exist.

## Code Style

### TypeScript
- Strict mode enabled
- Explicit return types and parameter types required
- Interfaces for object shapes, types for unions/primitives
- Never use `any`, `@ts-ignore`, or `@ts-expect-error`

```typescript
interface Post {
  id: string;
  content: string;
  like: number;
}

export function fetchPosts(postId: string): Promise<Post> {
  // implementation
}
```

### Imports
Three groups: external libs, components, utils. Use `@/*` path aliases.

```typescript
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { createClient } from '@/utils/supabase/client';
```

### Components
- Client: `"use client"` at top
- PascalCase names, default exports
- Define props type inline with component

```typescript
"use client";
import { Button } from '@/components/ui/button';

type PostCardProps = { 
  id: string; 
  content: string; 
  onLike?: () => void;
};

export default function PostCard({ id, content, onLike }: PostCardProps) {
  // implementation
}
```

### State Management (Zustand)
Define interfaces, use functional updates. Store names without 'use' prefix.

```typescript
import { create } from 'zustand';

interface PostStore { 
  posts: Post[]; 
  addPost: (post: Post) => void; 
}

export const postStore = create<PostStore>((set) => ({
  posts: [],
  addPost: (post) => set((state) => ({ 
    posts: [post, ...state.posts] 
  })),
}));
```

### Database (Prisma)
All exports from `lib/prisma.ts`. Handle async with try/catch.

```typescript
import { prisma } from '@/lib/prisma';

export async function getPost(id: string) {
  try { 
    return await prisma.post.findUnique({ where: { id } }); 
  } catch (error) { 
    console.error('Failed to fetch post:', error); 
    return null; 
  }
}
```

### Supabase
- Client: `createClient()` from `@/utils/supabase/client`
- Server: `createServerClient()` from `@supabase/ssr`

### Styling (Tailwind CSS v4)
Use `cn()` helper. Follow shadcn/ui conventions (`new-york` style).

```typescript
import { cn } from '@/lib/utils';
<div className={cn("base", cond && "conditional", className)} />
```

### Error Handling
Try/catch for async. Log errors with context. Never use empty catch blocks.

```typescript
try { 
  if (error) throw error; 
  return data; 
} catch (error) { 
  console.error('Failed:', error); 
  return []; 
}
```

### API Routes
Use `app/api/`. Return proper NextResponse.

```typescript
import { NextResponse } from 'next/server';

export async function GET() { 
  return NextResponse.json(data); 
}
```

### Naming Conventions

| Type | Convention |
|------|------------|
| Variables/Functions | camelCase |
| Components/Types | PascalCase |
| Constants | SCREAMING_SNAKE_CASE |
| Files | PascalCase (components), kebab-case (utils) |
| DB Tables | snake_case (Prisma) |
| Zustand Stores | *Store suffix (e.g., postStore, userStore) |

### File Organization
```
├── app/               # Next.js App Router
├── components/
│   ├── ui/           # shadcn/ui components
│   ├── gekaixing/    # Custom components
│   └── kibo-ui/      # Third-party UI
├── lib/              # prisma.ts, utils.ts, notion.ts
├── store/            # Zustand stores
├── messages/         # i18n translations
├── utils/            # Helpers (supabase client)
├── prisma/           # Schema
└── public/           # Static
```

### Environment Variables
Never commit `.env.local`. Required:
- `DATABASE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### i18n (next-intl)
Translations in `messages/` directory. Use `useTranslations` hook in components.

### ESLint Configuration
Extends: `next/core-web-vitals`, `next/typescript`
Override: `@typescript-eslint/no-unused-vars` is disabled

### Best Practices
- React Server Components by default, client only when needed
- Single responsibility, extract complex logic to hooks
- No comments unless explaining complex logic
- Always handle async errors
- Use proper TypeScript types everywhere

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
