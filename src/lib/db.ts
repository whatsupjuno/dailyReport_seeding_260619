import { Pool, types, type PoolClient, type QueryResultRow } from "pg";
import { env } from "./env";

// DATE(oid 1082)를 JS Date가 아닌 'YYYY-MM-DD' 문자열 그대로 반환 (KST 경계/포맷 안전)
types.setTypeParser(1082, (v: string) => v);

// 개발 중 HMR로 Pool이 중복 생성되는 것 방지 (globalThis 캐시)
const g = globalThis as unknown as { __seedingPool?: Pool };

export const pool: Pool =
  g.__seedingPool ??
  new Pool({
    connectionString: env.databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
  });

if (process.env.NODE_ENV !== "production") g.__seedingPool = pool;

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const res = await pool.query<T>(text, params as never);
  return res.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

// 트랜잭션 헬퍼
export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
