import { z } from 'zod'

// Sukuk validation schemas
export const createSukukSchema = z.object({
  accountId: z.string().min(1, 'Account is required'),
  name: z.string().min(1, 'Name is required'),
  category: z.string().optional(),
  principalAmount: z.number().positive('Principal amount must be positive'),
  currentValue: z.number().min(0, 'Current value cannot be negative').optional(),
  startDate: z.string().refine((date) => !isNaN(Date.parse(date)), {
    message: 'Invalid start date',
  }),
  maturityDate: z.string().optional().refine((date) => !date || !isNaN(Date.parse(date)), {
    message: 'Invalid maturity date',
  }),
  // Note: Using 'interestRate' to match existing database schema, but represents profit/return rate for Sukuk
  interestRate: z.number().min(0).max(100).optional(),
  fees: z.number().min(0, 'Fees cannot be negative').optional(),
  totalReceived: z.number().min(0, 'Total received cannot be negative').optional(),
  notes: z.string().optional(),
  metadata: z.string().optional(),
  participants: z.array(z.object({
    personId: z.string().min(1, 'Person ID is required'),
    investedAmount: z.number().positive('Invested amount must be positive'),
    sharePercentage: z.number().min(0).max(100).optional(),
    notes: z.string().optional(),
  })).optional(),
})

export const updateSukukSchema = z.object({
  accountId: z.string().min(1, 'Account is required').optional(),
  name: z.string().min(1, 'Name is required').optional(),
  category: z.string().optional(),
  principalAmount: z.number().positive('Principal amount must be positive').optional(),
  currentValue: z.number().min(0, 'Current value cannot be negative').optional(),
  startDate: z.string().optional().refine((date) => !date || !isNaN(Date.parse(date)), {
    message: 'Invalid start date',
  }),
  maturityDate: z.string().optional().refine((date) => !date || !isNaN(Date.parse(date)), {
    message: 'Invalid maturity date',
  }),
  interestRate: z.number().min(0).max(100).optional(),
  fees: z.number().min(0, 'Fees cannot be negative').optional(),
  totalReceived: z.number().min(0, 'Total received cannot be negative').optional(),
  notes: z.string().optional(),
  metadata: z.string().optional(),
  participants: z.array(z.object({
    personId: z.string().min(1, 'Person ID is required'),
    investedAmount: z.number().positive('Invested amount must be positive'),
    sharePercentage: z.number().min(0).max(100).optional(),
    notes: z.string().optional(),
  })).optional(),
})

export type CreateSukukInput = z.infer<typeof createSukukSchema>
export type UpdateSukukInput = z.infer<typeof updateSukukSchema>
