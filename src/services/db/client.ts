import { logger } from "../utils/logger.js";
import { prismaManager } from "./manager.js";

/**
 * Get Prisma Client instance
 * 
 */
 async function prismaClient() {
    const client = await prismaManager.getClient();
    return client;
}
// export and ensure prisma client does not return undefined;
export const prisma = await prismaClient();