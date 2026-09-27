import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { AuthenticatedUser } from '../auth/authenticated-user';
import { EquipmentService } from './equipment.service';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const integration = describe.skipIf(!testDatabaseUrl);
const manager: AuthenticatedUser = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Demo Manager',
  email: 'manager@example.test',
  role: 'manager'
};
const memberId = '00000000-0000-4000-8000-000000000002';

integration('equipment checkout database invariants', () => {
  let database: DatabaseService;
  let equipment: EquipmentService;
  let equipmentId: string;
  let oldDatabaseUrl: string | undefined;

  beforeAll(async () => {
    oldDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = testDatabaseUrl;
    database = new DatabaseService();
    equipment = new EquipmentService(database);
    const item = await equipment.createEquipment(
      { name: `Integration item ${randomUUID()}`, description: 'Disposable integration-test record' },
      manager
    );
    equipmentId = item.id;
  });

  afterAll(async () => {
    await database?.onModuleDestroy();
    if (oldDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = oldDatabaseUrl;
  });

  it('allows one concurrent checkout, enforces state transitions, and records append-only audit events', async () => {
    const dueAt = new Date(Date.now() + 60_000).toISOString();
    const attempts = await Promise.allSettled([
      equipment.checkout(equipmentId, { memberId, dueAt }, manager),
      equipment.checkout(equipmentId, { memberId, dueAt }, manager)
    ]);
    const successful = attempts.filter((attempt) => attempt.status === 'fulfilled');
    const rejected = attempts.filter((attempt) => attempt.status === 'rejected');
    expect(successful).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].status === 'rejected' && rejected[0].reason).toBeInstanceOf(ConflictException);
    const loanId = (successful[0] as PromiseFulfilledResult<{ id: string }>).value.id;

    await equipment.returnLoan(loanId, {
      condition: 'maintenance',
      conditionNote: 'Integration-test condition report'
    }, manager);
    await expect(equipment.checkout(equipmentId, { memberId, dueAt }, manager))
      .rejects.toBeInstanceOf(ConflictException);
    await equipment.changeStatus(equipmentId, 'restore', 'Integration test repair', manager);
    const restored = (await equipment.listEquipment()).find((item) => item.id === equipmentId);
    expect(restored?.status).toBe('available');

    await equipment.changeStatus(equipmentId, 'maintenance', 'Integration test maintenance', manager);
    await equipment.changeStatus(equipmentId, 'retire', 'Integration test retirement', manager);
    await expect(equipment.changeStatus(equipmentId, 'restore', 'Invalid transition', manager))
      .rejects.toBeInstanceOf(ConflictException);

    const audit = await database.query<{ id: string }>(
      `SELECT id FROM audit_events WHERE entity_id = $1 ORDER BY occurred_at DESC LIMIT 1`,
      [equipmentId]
    );
    await expect(database.query('UPDATE audit_events SET details = \'{}\'::jsonb WHERE id = $1', [audit.rows[0].id]))
      .rejects.toThrow('audit events are append-only');
  });
});
