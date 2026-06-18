import "./_loadenv";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";

const MIGRATIONS_DIR = resolve(process.cwd(), "db/migrations");
const reset = process.argv.includes("--reset");

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL not set");
  const client = new Client({ connectionString });
  await client.connect();

  try {
    if (reset) {
      console.log("[migrate] DROP SCHEMA public CASCADE; recreate");
      await client.query("DROP SCHEMA IF EXISTS public CASCADE;");
      await client.query("CREATE SCHEMA public;");
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    const applied = new Set(
      (await client.query<{ filename: string }>("SELECT filename FROM schema_migrations")).rows.map(
        (r) => r.filename,
      ),
    );

    let files: string[] = [];
    try {
      files = readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith(".sql"))
        .sort();
    } catch {
      console.log("[migrate] no migrations dir yet:", MIGRATIONS_DIR);
    }

    let count = 0;
    for (const f of files) {
      if (applied.has(f)) continue;
      const sql = readFileSync(resolve(MIGRATIONS_DIR, f), "utf8");
      console.log(`[migrate] applying ${f}`);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations(filename) VALUES ($1)", [f]);
        await client.query("COMMIT");
        count++;
      } catch (e) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${f} failed: ${(e as Error).message}`);
      }
    }
    console.log(`[migrate] done. applied ${count} new migration(s).`);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
