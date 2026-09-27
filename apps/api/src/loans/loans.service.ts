import { Inject, Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/authenticated-user';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class LoansService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async listLoans(memberId?: string): Promise<unknown[]> {
    const result = await this.database.query(
      `SELECT l.id, l.equipment_id, e.name AS equipment_name, l.member_id,
              m.name AS member_name, l.checked_out_by, l.checked_out_at, l.due_at,
              l.returned_at, l.return_condition, l.condition_note,
              (l.returned_at IS NULL AND l.due_at < now()) AS overdue
       FROM loans l
       JOIN equipment e ON e.id = l.equipment_id
       JOIN members m ON m.id = l.member_id
       WHERE ($1::uuid IS NULL OR l.member_id = $1)
       ORDER BY l.checked_out_at DESC, l.id
       LIMIT 200`,
      [memberId ?? null]
    );
    return result.rows;
  }

  async listAudit(): Promise<unknown[]> {
    const result = await this.database.query(
      `SELECT a.id, a.actor_id, m.name AS actor_name, a.action,
              a.entity_type, a.entity_id, a.details, a.occurred_at
       FROM audit_events a
       JOIN members m ON m.id = a.actor_id
       ORDER BY a.occurred_at DESC, a.id DESC
       LIMIT 200`
    );
    return result.rows;
  }

  async listMyLoans(user: AuthenticatedUser): Promise<unknown[]> {
    return this.listLoans(user.id);
  }
}
