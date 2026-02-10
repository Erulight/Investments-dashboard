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
  receivableAmount: z.number().min(0, 'Receivable cannot be negative').optional(),
  isIjarah: z.boolean().optional(),
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
  receivableAmount: z.number().min(0, 'Receivable cannot be negative').optional(),
  isIjarah: z.boolean().optional(),
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

// Savings (Circlys/ROSCA) validation schemas
export const createSavingsSchema = z.object({
  accountId: z.string().min(1, 'Account is required'),
  name: z.string().min(1, 'Plan name is required'),
  // ROSCA fields
  monthlyContribution: z.number().positive('Monthly contribution must be positive'),
  totalMonths: z.number().int().min(1, 'Total months must be at least 1'),
  bookingFee: z.number().min(0, 'Booking fee cannot be negative').optional(),
  rewardProgram: z.enum(['NONE', 'FIXED', 'PERCENTAGE']).optional(),
  rewardAmount: z.number().min(0, 'Reward amount cannot be negative').optional(),
  receiptMonth: z.number().int().min(1, 'Receipt month must be at least 1').optional(),
  startDate: z.string().refine((date) => !isNaN(Date.parse(date)), {
    message: 'Invalid start date',
  }),
  notes: z.string().optional(),
  participants: z.array(z.object({
    personId: z.string().min(1, 'Person ID is required'),
    investedAmount: z.number().positive('Invested amount must be positive'),
    sharePercentage: z.number().min(0).max(100).optional(),
    notes: z.string().optional(),
  })).optional(),
})

export const updateSavingsSchema = z.object({
  accountId: z.string().min(1, 'Account is required').optional(),
  name: z.string().min(1, 'Plan name is required').optional(),
  monthlyContribution: z.number().positive('Monthly contribution must be positive').optional(),
  totalMonths: z.number().int().min(1, 'Total months must be at least 1').optional(),
  bookingFee: z.number().min(0, 'Booking fee cannot be negative').optional(),
  rewardProgram: z.enum(['NONE', 'FIXED', 'PERCENTAGE']).optional(),
  rewardAmount: z.number().min(0, 'Reward amount cannot be negative').optional(),
  receiptMonth: z.number().int().min(1, 'Receipt month must be at least 1').optional(),
  startDate: z.string().optional().refine((date) => !date || !isNaN(Date.parse(date)), {
    message: 'Invalid start date',
  }),
  notes: z.string().optional(),
  participants: z.array(z.object({
    personId: z.string().min(1, 'Person ID is required'),
    investedAmount: z.number().positive('Invested amount must be positive'),
    sharePercentage: z.number().min(0).max(100).optional(),
    notes: z.string().optional(),
  })).optional(),
})

export type CreateSavingsInput = z.infer<typeof createSavingsSchema>
export type UpdateSavingsInput = z.infer<typeof updateSavingsSchema>

// SIP validation schemas
export const createSipSchema = z.object({
  accountId: z.string().min(1, 'Account is required'),
  name: z.string().min(1, 'SIP name is required'),
  totalMonthlyAmount: z.number().positive('Total monthly amount must be positive'),
  startDate: z.string().refine((date) => !isNaN(Date.parse(date)), {
    message: 'Invalid start date',
  }),
  notes: z.string().optional(),
  allocations: z.array(z.object({
    company: z.string().min(1, 'Company is required'),
    category: z.string().min(1, 'Category is required'),
    amount: z.number().positive('Amount must be positive'),
    percentage: z.number().min(0).max(100).optional(),
    notes: z.string().optional(),
  })).min(1, 'At least one allocation is required'),
}).refine((data) => {
  const totalAllocated = data.allocations.reduce((sum, a) => sum + a.amount, 0)
  if (Math.abs(totalAllocated - data.totalMonthlyAmount) > 0.01) {
    return false
  }
  return true
}, {
  message: 'Sum of allocations must equal total monthly amount',
  path: ['allocations'],
})

export const updateSipSchema = z.object({
  accountId: z.string().min(1, 'Account is required').optional(),
  name: z.string().min(1, 'SIP name is required').optional(),
  totalMonthlyAmount: z.number().positive('Total monthly amount must be positive').optional(),
  startDate: z.string().optional().refine((date) => !date || !isNaN(Date.parse(date)), {
    message: 'Invalid start date',
  }),
  notes: z.string().optional(),
  allocations: z.array(z.object({
    company: z.string().min(1, 'Company is required'),
    category: z.string().min(1, 'Category is required'),
    amount: z.number().positive('Amount must be positive'),
    percentage: z.number().min(0).max(100).optional(),
    notes: z.string().optional(),
  })).optional(),
}).refine((data) => {
  if (data.totalMonthlyAmount && data.allocations) {
    const totalAllocated = data.allocations.reduce((sum, a) => sum + a.amount, 0)
    if (Math.abs(totalAllocated - data.totalMonthlyAmount) > 0.01) {
      return false
    }
  }
  return true
}, {
  message: 'Sum of allocations must equal total monthly amount',
  path: ['allocations'],
})

export type CreateSipInput = z.infer<typeof createSipSchema>
export type UpdateSipInput = z.infer<typeof updateSipSchema>
