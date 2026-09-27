import 'dotenv/config';
import { Pool } from 'pg';

export const demoManagerId = '00000000-0000-4000-8000-000000000001';
export const demoMemberId = '00000000-0000-4000-8000-000000000002';
export const demoEquipmentId = '00000000-0000-4000-8000-000000000003';

async function main(): Promise<void> {
  if (process.env.NODE_ENV !== 'development') {
    throw new Error('Development seed data can only be loaded when NODE_ENV=development');
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required');
  const pool = new Pool({ connectionString });
  try {
    await pool.query(
      `INSERT INTO members(id, name, email, role, active)
       VALUES
         ($1, 'Demo Manager', 'manager@example.test', 'manager', true),
         ($2, 'Demo Member', 'member@example.test', 'member', true)
       ON CONFLICT(id) DO NOTHING`,
      [demoManagerId, demoMemberId]
    );
    await pool.query(
      `INSERT INTO equipment(id, name, description, status, created_by)
       VALUES ($1, 'Digital Multimeter', 'Demo equipment for checkout workflow.', 'available', $2)
       ON CONFLICT(id) DO NOTHING`,
      [demoEquipmentId, demoManagerId]
    );
    process.stdout.write('Development identities and equipment are ready.\n');
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
