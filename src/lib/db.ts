import { PrismaClient } from "@prisma/client";

function isConnectionError(error: any): boolean {
  const msg = error?.message || "";
  const code = error?.code;
  return (
    msg.includes("forcibly closed") ||
    msg.includes("Can't reach database server") ||
    msg.includes("ConnectionReset") ||
    msg.includes("ECONNRESET") ||
    msg.includes("closed by the remote host") ||
    msg.includes("prepared statement") ||
    code === "P1001" ||
    code === "P1017" ||
    code === "10054"
  );
}

function createPrismaClient() {
  const baseClient = new PrismaClient({
    log:
      process.env.PRISMA_LOG_QUERIES === "true"
        ? ["query", "error", "warn"]
        : ["error", "warn"],
  });

  return baseClient.$extends({
    client: {
      async $queryRawUnsafeWithRetry<T = any>(query: string, ...values: any[]): Promise<T> {
        let attempts = 0;
        const maxAttempts = 3;
        while (attempts < maxAttempts) {
          try {
            return await baseClient.$queryRawUnsafe<T>(query, ...values);
          } catch (error: any) {
            attempts++;
            if (isConnectionError(error) && attempts < maxAttempts) {
              console.warn(
                `[Prisma Resilience] Retrying $queryRawUnsafe after connection reset (attempt ${attempts}/${maxAttempts})...`
              );
              try {
                await baseClient.$disconnect();
              } catch {}
              await new Promise((resolve) => setTimeout(resolve, 300 * attempts));
              try {
                await baseClient.$connect();
              } catch {}
              continue;
            }
            throw error;
          }
        }
        throw new Error("Query failed after retry attempts");
      },
      async $executeRawUnsafeWithRetry(query: string, ...values: any[]): Promise<number> {
        let attempts = 0;
        const maxAttempts = 3;
        while (attempts < maxAttempts) {
          try {
            return await baseClient.$executeRawUnsafe(query, ...values);
          } catch (error: any) {
            attempts++;
            if (isConnectionError(error) && attempts < maxAttempts) {
              console.warn(
                `[Prisma Resilience] Retrying $executeRawUnsafe after connection reset (attempt ${attempts}/${maxAttempts})...`
              );
              try {
                await baseClient.$disconnect();
              } catch {}
              await new Promise((resolve) => setTimeout(resolve, 300 * attempts));
              try {
                await baseClient.$connect();
              } catch {}
              continue;
            }
            throw error;
          }
        }
        throw new Error("Execute failed after retry attempts");
      },
    },
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          let attempts = 0;
          const maxAttempts = 3;
          while (attempts < maxAttempts) {
            try {
              return await query(args);
            } catch (error: any) {
              attempts++;
              if (isConnectionError(error) && attempts < maxAttempts) {
                console.warn(
                  `[Prisma Resilience] Retrying ${model}.${operation} after connection reset (attempt ${attempts}/${maxAttempts})...`
                );
                try {
                  await baseClient.$disconnect();
                } catch {}
                await new Promise((resolve) => setTimeout(resolve, 300 * attempts));
                try {
                  await baseClient.$connect();
                } catch {}
                continue;
              }
              throw error;
            }
          }
        },
      },
    },
  });
}

type ExtendedPrismaClient = ReturnType<typeof createPrismaClient>;

const globalForPrisma = globalThis as unknown as {
  prisma: ExtendedPrismaClient | undefined;
};

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
