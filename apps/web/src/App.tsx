import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { z } from 'zod';

const managerId = '00000000-0000-4000-8000-000000000001';
const memberId = '00000000-0000-4000-8000-000000000002';
const equipmentSchema = z.array(z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string(),
  status: z.enum(['available', 'checked_out', 'maintenance', 'retired']),
  created_at: z.string(),
  updated_at: z.string()
}));
const memberSchema = z.array(z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string(),
  active: z.boolean()
}));
const loanSchema = z.array(z.object({
  id: z.string().uuid(),
  equipment_id: z.string().uuid(),
  equipment_name: z.string(),
  member_id: z.string().uuid(),
  member_name: z.string(),
  checked_out_by: z.string().uuid(),
  checked_out_at: z.string(),
  due_at: z.string(),
  returned_at: z.string().nullable(),
  return_condition: z.enum(['serviceable', 'maintenance']).nullable(),
  condition_note: z.string().nullable(),
  overdue: z.boolean()
}));

type Equipment = z.infer<typeof equipmentSchema>[number];
type Member = z.infer<typeof memberSchema>[number];
type Loan = z.infer<typeof loanSchema>[number];
type Role = 'manager' | 'member';

async function request<T>(path: string, userId: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  const response = await fetch(`http://localhost:3001/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-dev-user-id': userId,
      ...init?.headers
    }
  });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const message = typeof body === 'object' && body !== null && 'message' in body
      ? String(body.message)
      : `Request failed (${response.status})`;
    throw new Error(message);
  }
  return schema.parse(await response.json());
}

export default function App() {
  const [role, setRole] = useState<Role>('member');
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const userId = role === 'manager' ? managerId : memberId;

  const refresh = useCallback(async () => {
    setError('');
    try {
      const [nextEquipment, nextLoans] = await Promise.all([
        request('/equipment', userId, equipmentSchema),
        request(role === 'manager' ? '/loans' : '/loans/mine', userId, loanSchema)
      ]);
      setEquipment(nextEquipment);
      setLoans(nextLoans);
      if (role === 'manager') {
        setMembers(await request('/equipment/members', userId, memberSchema));
      } else {
        setMembers([]);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load application data');
    }
  }, [role, userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function mutate(operation: () => Promise<unknown>): Promise<void> {
    setBusy(true);
    setError('');
    try {
      await operation();
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The operation failed');
    } finally {
      setBusy(false);
    }
  }

  async function createEquipment(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const name = String(form.get('name') ?? '').trim();
    const description = String(form.get('description') ?? '').trim();
    if (!name) return;
    await mutate(() => request('/equipment', userId, z.object({ id: z.string().uuid() }), {
      method: 'POST',
      body: JSON.stringify({ name, description })
    }));
    formElement.reset();
  }

  async function checkout(event: FormEvent<HTMLFormElement>, item: Equipment): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const selectedMemberId = String(form.get('memberId') ?? '');
    const parsedDueAt = new Date(String(form.get('dueAt') ?? ''));
    if (!Number.isFinite(parsedDueAt.getTime())) {
      setError('Choose a valid due date.');
      return;
    }
    const dueAt = parsedDueAt.toISOString();
    await mutate(() => request(`/equipment/${item.id}/checkout`, userId, z.object({ id: z.string().uuid() }), {
      method: 'POST',
      body: JSON.stringify({ memberId: selectedMemberId, dueAt })
    }));
  }

  async function returnLoan(event: FormEvent<HTMLFormElement>, loan: Loan): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const condition = String(form.get('condition')) as 'serviceable' | 'maintenance';
    const conditionNote = String(form.get('conditionNote') ?? '').trim();
    if (condition === 'maintenance' && !conditionNote) {
      setError('A condition note is required when reporting maintenance.');
      return;
    }
    await mutate(() => request(`/loans/${loan.id}/return`, userId, z.object({ id: z.string().uuid() }), {
      method: 'POST',
      body: JSON.stringify({ condition, conditionNote: conditionNote || undefined })
    }));
  }

  async function changeStatus(item: Equipment, action: 'maintenance' | 'restore' | 'retire'): Promise<void> {
    const note = window.prompt(`Reason for ${action}:`);
    if (!note?.trim()) return;
    await mutate(() => request(`/equipment/${item.id}/${action}`, userId, z.object({ id: z.string().uuid() }), {
      method: 'POST',
      body: JSON.stringify({ note: note.trim() })
    }));
  }

  const activeLoans = loans.filter((loan) => !loan.returned_at);

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Lab inventory</p>
          <h1>Equipment checkout</h1>
        </div>
        <label className="identity-picker">
          Development identity
          <select value={role} onChange={(event) => setRole(event.target.value as Role)}>
            <option value="member">Member</option>
            <option value="manager">Equipment manager</option>
          </select>
        </label>
      </header>

      {error && <div className="error" role="alert">{error}</div>}

      <section className="section-heading">
        <div>
          <h2>Equipment</h2>
          <p>Current availability and circulation status</p>
        </div>
        <button className="secondary-button" onClick={() => void refresh()} disabled={busy}>Refresh</button>
      </section>

      {role === 'manager' && (
        <form className="create-form panel" onSubmit={(event) => void createEquipment(event)}>
          <label>Equipment name<input name="name" required maxLength={160} placeholder="e.g. Oscilloscope" /></label>
          <label>Description<input name="description" maxLength={2000} placeholder="Optional details" /></label>
          <button disabled={busy}>Add equipment</button>
        </form>
      )}

      <section className="equipment-grid" aria-label="Equipment inventory">
        {equipment.map((item) => {
          const activeLoan = activeLoans.find((loan) => loan.equipment_id === item.id);
          return (
            <article className="panel equipment-card" key={item.id}>
              <div className="card-title-row">
                <h3>{item.name}</h3>
                <span className={`badge ${item.status}`}>{item.status.replace('_', ' ')}</span>
              </div>
              <p className="description">{item.description || 'No description provided.'}</p>
              {activeLoan && (
                <p className="loan-summary">
                  {role === 'manager' ? `With ${activeLoan.member_name}` : 'Checked out to you'}
                  {' · due '}{new Date(activeLoan.due_at).toLocaleString()}
                </p>
              )}
              {role === 'manager' && item.status === 'available' && (
                <form className="stack-form" onSubmit={(event) => void checkout(event, item)}>
                  <label>Check out to
                    <select name="memberId" required defaultValue="">
                      <option value="" disabled>Select a member</option>
                      {members.filter((member) => member.active).map((member) => (
                        <option value={member.id} key={member.id}>{member.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>Due date<input name="dueAt" type="datetime-local" required /></label>
                  <button disabled={busy || members.length === 0}>Check out</button>
                </form>
              )}
              {role === 'manager' && item.status === 'available' && (
                <button className="text-button" disabled={busy} onClick={() => void changeStatus(item, 'maintenance')}>
                  Place in maintenance
                </button>
              )}
              {role === 'manager' && item.status === 'maintenance' && (
                <div className="button-row">
                  <button className="secondary-button" disabled={busy} onClick={() => void changeStatus(item, 'restore')}>Restore to service</button>
                  <button className="text-button" disabled={busy} onClick={() => void changeStatus(item, 'retire')}>Retire</button>
                </div>
              )}
              {role === 'manager' && item.status === 'available' && (
                <button className="text-button danger-text" disabled={busy} onClick={() => void changeStatus(item, 'retire')}>
                  Retire equipment
                </button>
              )}
            </article>
          );
        })}
        {equipment.length === 0 && <p className="empty-state">No equipment has been added yet.</p>}
      </section>

      <section className="section-heading loans-heading">
        <div>
          <h2>{role === 'manager' ? 'Active loans' : 'Your loans'}</h2>
          <p>{role === 'manager' ? 'Open checkouts across the lab' : 'Your checkout history and due dates'}</p>
        </div>
      </section>
      <section className="loan-list" aria-label="Loans">
        {loans.map((loan) => (
          <article className="panel loan-card" key={loan.id}>
            <div>
              <h3>{loan.equipment_name}</h3>
              {role === 'manager' && <p>{loan.member_name}</p>}
              <p>Checked out {new Date(loan.checked_out_at).toLocaleString()}</p>
              <p className={loan.overdue ? 'overdue' : ''}>
                {loan.overdue ? 'Overdue · ' : 'Due '}{new Date(loan.due_at).toLocaleString()}
              </p>
              {loan.returned_at && <p>Returned {new Date(loan.returned_at).toLocaleString()} · {loan.return_condition}</p>}
              {loan.condition_note && <p>Condition note: {loan.condition_note}</p>}
            </div>
            {role === 'manager' && !loan.returned_at && (
              <form className="return-form" onSubmit={(event) => void returnLoan(event, loan)}>
                <label>Return condition
                  <select name="condition">
                    <option value="serviceable">Serviceable</option>
                    <option value="maintenance">Needs maintenance</option>
                  </select>
                </label>
                <label>Condition note<input name="conditionNote" maxLength={2000} /></label>
                <button disabled={busy}>Record return</button>
              </form>
            )}
          </article>
        ))}
        {loans.length === 0 && <p className="empty-state">No loans to show.</p>}
      </section>

      <footer>Development identities only · production sign-in is not configured</footer>
    </main>
  );
}
