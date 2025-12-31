// src/db/client.ts
import { PrismaClient } from '@prisma/client';
import { prismaManager } from './manager.js';

/**
 * Prisma client proxy that lazily retrieves the client from the manager.
 * 
 * **Why a proxy?**
 * - Allows clean imports: `import { prisma } from './db/client.js'`
 * - No need to call functions everywhere: `await prismaManager.getClient()`
 * - Lazy evaluation: Client is only retrieved when actually accessed
 * - Type-safe: Full Prisma Client types available
 * 
 * **How it works:**
 * - Uses JavaScript Proxy to intercept property access
 * - On first access, retrieves client from manager
 * - Caches client for subsequent accesses
 * - Forwards all Prisma operations to actual client
 * 
 * **Important:** The manager must be initialized before using this proxy.
 * 
 * @example
 * ```typescript
 * // Clean import - no function calls needed
 * import { prisma } from './db/client.js';
 * 
 * // Use directly in routes
 * const users = await prisma.user.findMany();
 * const post = await prisma.post.create({ data: {...} });
 * 
 * // All Prisma methods work
 * await prisma.$transaction([...]);
 * await prisma.$queryRaw`...`;
 * ```
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(target, prop) {
    // Lazy retrieve client from manager
    const client = prismaManager.getClient();
    
    // If client returns a promise (async), handle it
    if (client instanceof Promise) {
      return async (...args: any[]) => {
        const resolvedClient = await client;
        const value = (resolvedClient as any)[prop];
        
        if (typeof value === 'function') {
          return value.apply(resolvedClient, args);
        }
        
        return value;
      };
    }
    
    // Synchronous access
    const value = (client as any)[prop];
    
    if (typeof value === 'function') {
      return value.bind(client);
    }
    
    return value;
  },
});

/**
 * Get Prisma client directly from manager.
 * 
 * **Use this if you need explicit error handling or prefer explicit async.**
 * 
 * @returns Promise resolving to Prisma client
 * @throws {Error} If manager is not initialized
 * 
 * @example
 * ```typescript
 * import { getPrismaClient } from './db/client.js';
 * 
 * async function myRoute() {
 *   try {
 *     const client = await getPrismaClient();
 *     return await client.user.findMany();
 *   } catch (error) {
 *     console.error('Database not ready:', error);
 *   }
 * }
 * ```
 */
export async function getPrismaClient(): Promise<PrismaClient> {
  return prismaManager.getClient();
}

/**
 * Check if Prisma client is ready to use.
 * 
 * @returns True if manager is initialized and client is available
 * 
 * @example
 * ```typescript
 * import { isPrismaReady } from './db/client.js';
 * 
 * if (isPrismaReady()) {
 *   const users = await prisma.user.findMany();
 * }
 * ```
 */
export function isPrismaReady(): boolean {
  return prismaManager.isReady();
}

/**
 * Type-safe Prisma client type export.
 * 
 * Use this when you need to type function parameters or return values.
 * 
 * @example
 * ```typescript
 * import type { PrismaClientType } from './db/client.js';
 * 
 * function queryUsers(client: PrismaClientType) {
 *   return client.user.findMany();
 * }
 * ```
 */
export type PrismaClientType = PrismaClient;