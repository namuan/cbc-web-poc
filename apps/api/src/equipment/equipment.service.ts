import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PoolClient, QueryResultRow } from 'pg';
import { AuthenticatedUser } from '../auth/authenticated-user';
import { DatabaseService } from '../database/database.service';
import { CheckoutInput, CreateEquipmentInput, ReturnInput } from './equipment.schemas';

type EquipmentRow = QueryResultRow & {
  id: string;
  name: string;
  description: string;
  status: 'available' | 'checked_out' | 'maintenance' | 'retired';
  created_at: Date;
  updated_at: Date;
};

@Injectable()
export class EquipmentService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async listEquipment(): Promise<EquipmentRow[]> {
    const result = await this.database.query<EquipmentRow>(
      `SELECT id, name, description, status, created_at, updated_at
       FROM equipment ORDER BY name, id`
    );
    return result.rows;
  }

  async listMembers(): Promise<unknown[]> {
    const result = await this.database.query(
      `SELECT id, name, email, active FROM members ORDER BY name, id`
    );
    return result.rows;
  }

  async createEquipment(input: CreateEquipmentInput, actor: AuthenticatedUser): Promise<EquipmentRow> {
    return this.database.transaction(async (client) => {
      const result = await client.query<EquipmentRow>(
        `INSERT INTO equipment(name, description, created_by)
         VALUES ($1, $2, $3)
         RETURNING id, name, description, status, created_at, updated_at`,
        [input.name, input.description, actor.id]
      );
      const item = result.rows[0];
      await this.recordAudit(client, actor.id, 'equipment.created', 'equipment', item.id, {
        name: item.name
      });
      return item;
    });
  }

  async checkout(
    equipmentId: string,
    input: CheckoutInput,
    actor: AuthenticatedUser
  ): Promise<unknown> {
    const dueAt = new Date(input.dueAt);
    if (!Number.isFinite(dueAt.getTime()) || dueAt <= new Date()) {
      throw new BadRequestException('dueAt must be in the future');
    }
    try {
      return await this.database.transaction(async (client) => {
        const item = await client.query<{ id: string; status: string }>(
          'SELECT id, status FROM equipment WHERE id = $1 FOR UPDATE',
          [equipmentId]
        );
        if (!item.rowCount) throw new NotFoundException('Equipment not found');
        if (item.rows[0].status !== 'available') {
          throw new ConflictException(`Equipment is ${item.rows[0].status}`);
        }
        const member = await client.query<{ id: string }>(
          'SELECT id FROM members WHERE id = $1 AND active = true',
          [input.memberId]
        );
        if (!member.rowCount) throw new BadRequestException('Member is missing or inactive');
        const loanResult = await client.query(
          `INSERT INTO loans(equipment_id, member_id, checked_out_by, due_at)
           VALUES ($1, $2, $3, $4)
           RETURNING id, equipment_id, member_id, checked_out_by, checked_out_at, due_at, returned_at`,
          [equipmentId, input.memberId, actor.id, dueAt]
        );
        await client.query(
          `UPDATE equipment SET status = 'checked_out', updated_at = now() WHERE id = $1`,
          [equipmentId]
        );
        await this.recordAudit(client, actor.id, 'loan.checked_out', 'loan', loanResult.rows[0].id, {
          equipmentId,
          memberId: input.memberId,
          dueAt: dueAt.toISOString()
        });
        return loanResult.rows[0];
      });
    } catch (error) {
      this.rethrowDatabaseConflict(error);
    }
  }

  async returnLoan(loanId: string, input: ReturnInput, actor: AuthenticatedUser): Promise<unknown> {
    return this.database.transaction(async (client) => {
      const loanResult = await client.query<{
        id: string;
        equipment_id: string;
        returned_at: Date | null;
      }>(
        'SELECT id, equipment_id, returned_at FROM loans WHERE id = $1 FOR UPDATE',
        [loanId]
      );
      if (!loanResult.rowCount) throw new NotFoundException('Loan not found');
      const loan = loanResult.rows[0];
      if (loan.returned_at) throw new ConflictException('Loan has already been returned');
      const equipment = await client.query<{ status: string }>(
        'SELECT status FROM equipment WHERE id = $1 FOR UPDATE',
        [loan.equipment_id]
      );
      if (equipment.rows[0]?.status !== 'checked_out') {
        throw new ConflictException('Equipment and loan state are inconsistent');
      }
      const returnedAt = await client.query(
        `UPDATE loans
         SET returned_at = now(), returned_by = $2, return_condition = $3, condition_note = $4
         WHERE id = $1
         RETURNING id, equipment_id, member_id, checked_out_at, due_at, returned_at, return_condition, condition_note`,
        [loanId, actor.id, input.condition, input.conditionNote ?? null]
      );
      const nextStatus = input.condition === 'maintenance' ? 'maintenance' : 'available';
      await client.query(
        'UPDATE equipment SET status = $2, updated_at = now() WHERE id = $1',
        [loan.equipment_id, nextStatus]
      );
      await this.recordAudit(client, actor.id, 'loan.returned', 'loan', loanId, {
        equipmentId: loan.equipment_id,
        condition: input.condition,
        conditionNote: input.conditionNote ?? null
      });
      return returnedAt.rows[0];
    });
  }

  async changeStatus(
    equipmentId: string,
    action: 'maintenance' | 'restore' | 'retire',
    note: string,
    actor: AuthenticatedUser
  ): Promise<EquipmentRow> {
    return this.database.transaction(async (client) => {
      const result = await client.query<EquipmentRow>(
        'SELECT id, name, description, status, created_at, updated_at FROM equipment WHERE id = $1 FOR UPDATE',
        [equipmentId]
      );
      if (!result.rowCount) throw new NotFoundException('Equipment not found');
      const item = result.rows[0];
      const allowed =
        (action === 'maintenance' && item.status === 'available') ||
        (action === 'restore' && item.status === 'maintenance') ||
        (action === 'retire' && ['available', 'maintenance'].includes(item.status));
      if (!allowed) throw new ConflictException(`Cannot ${action} equipment in ${item.status} state`);
      const nextStatus = action === 'maintenance' ? 'maintenance' : action === 'restore' ? 'available' : 'retired';
      const updated = await client.query<EquipmentRow>(
        'UPDATE equipment SET status = $2, updated_at = now() WHERE id = $1 RETURNING id, name, description, status, created_at, updated_at',
        [equipmentId, nextStatus]
      );
      const auditAction = action === 'maintenance' ? 'equipment.maintenance' : action === 'restore' ? 'equipment.restored' : 'equipment.retired';
      await this.recordAudit(client, actor.id, auditAction, 'equipment', equipmentId, { note });
      return updated.rows[0];
    });
  }

  private async recordAudit(
    client: PoolClient,
    actorId: string,
    action: string,
    entityType: string,
    entityId: string,
    details: Record<string, unknown>
  ): Promise<void> {
    await client.query(
      `INSERT INTO audit_events(actor_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [actorId, action, entityType, entityId, JSON.stringify(details)]
    );
  }

  private rethrowDatabaseConflict(error: unknown): never {
    if (typeof error === 'object' && error !== null && 'code' in error) {
      const code = error.code;
      if (code === '23505') throw new ConflictException('Equipment already has an active loan');
      if (code === '23503') throw new BadRequestException('Referenced record does not exist');
      if (code === '23514') throw new BadRequestException('Database constraint rejected the operation');
    }
    throw error;
  }
}
