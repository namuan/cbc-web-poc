import { z } from 'zod';

export const createEquipmentSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).default('')
}).strict();

export const checkoutSchema = z.object({
  memberId: z.string().uuid(),
  dueAt: z.iso.datetime({ offset: true })
}).strict();

export const returnSchema = z.object({
  condition: z.enum(['serviceable', 'maintenance']),
  conditionNote: z.string().trim().max(2000).optional()
}).strict().superRefine((value, context) => {
  if (value.condition === 'maintenance' && !value.conditionNote) {
    context.addIssue({ code: 'custom', message: 'A condition note is required when reporting maintenance' });
  }
});

export const stateChangeSchema = z.object({
  note: z.string().trim().min(1).max(2000)
}).strict();

export type CreateEquipmentInput = z.infer<typeof createEquipmentSchema>;
export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type ReturnInput = z.infer<typeof returnSchema>;
