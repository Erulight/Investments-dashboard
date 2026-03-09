import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '@/app/api/sukuk/create/route'
import { createMockRequest, getResponseJson } from '@/test/utils'

// Mock dependencies
vi.mock('@/lib/rbac', () => ({
  requireAuth: vi.fn(),
  requireModuleAccess: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  prisma: {
    account: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    investment: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    dealParticipant: {
      createMany: vi.fn(),
    },
    systemSetting: {
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    cashBucket: {
      aggregate: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/audit', () => ({
  logAudit: vi.fn(),
}))

vi.mock('@/lib/cashBuckets', () => ({
  withdrawFromBuckets: vi.fn(),
}))

import { requireModuleAccess } from '@/lib/rbac'
import { prisma } from '@/lib/db'

describe('POST /api/sukuk/create', () => {
  const mockUser = {
    id: 'user-1',
    email: 'owner@example.local',
    role: 'OWNER',
    name: 'Owner',
    personId: null,
    permissions: null,
    person: null,
  }

  const mockAccount = {
    id: 'account-1',
    name: 'Test Account',
    currency: 'SAR',
  }

  const validSukukData = {
    accountId: 'account-1',
    name: 'Test Sukuk',
    category: 'Corporate',
    principalAmount: 100000,
    currentValue: 100000,
    startDate: '2024-01-01',
    maturityDate: '2025-01-01',
    interestRate: 5.5,
    notes: 'Test notes',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.systemSetting.findUnique).mockResolvedValue({
      key: 'CASH_BALANCE',
      value: '1000000',
    } as any)
    vi.mocked(prisma.account.findFirst).mockResolvedValue({
      id: 'cash-account',
      name: 'Cash Balance',
      currency: 'SAR',
      type: 'CASH',
    } as any)
    vi.mocked(prisma.cashBucket.aggregate).mockResolvedValue({
      _sum: { balance: 200000 },
    } as any)
  })

  it('should successfully create a sukuk with valid data', async () => {
    // Mock auth to return owner user
    vi.mocked(requireModuleAccess).mockResolvedValue(mockUser as any)

    // Mock account exists
    vi.mocked(prisma.account.findUnique).mockResolvedValue(mockAccount as any)

    const createdSukuk = {
      id: 'sukuk-1',
      ...validSukukData,
      startDate: new Date('2024-01-01'),
      maturityDate: new Date('2025-01-01'),
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const completeSukuk = {
      ...createdSukuk,
      account: mockAccount,
      dealParticipants: [],
    }

    // Mock transaction
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
      return callback({
        investment: {
          create: vi.fn().mockResolvedValue(createdSukuk),
          update: vi.fn().mockResolvedValue(createdSukuk),
        },
        dealParticipant: {
          createMany: vi.fn(),
        },
        account: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'cash-account',
            name: 'Cash Balance',
            currency: 'SAR',
            type: 'CASH',
          }),
          create: vi.fn(),
        },
        systemSetting: {
          findUnique: vi.fn().mockResolvedValue({
            key: 'CASH_BALANCE',
            value: '1000000',
          }),
          update: vi.fn(),
          create: vi.fn(),
          upsert: vi.fn().mockResolvedValue({
            key: 'CASH_BALANCE',
            value: '900000',
          }),
        },
        cashBucket: {
          aggregate: vi.fn().mockResolvedValue({
            _sum: { balance: 200000 },
          }),
        },
        transaction: {
          create: vi.fn(),
          aggregate: vi.fn().mockResolvedValue({
            _sum: { amount: 200000 },
          }),
        },
        investmentBucketAllocation: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      })
    })

    // Mock findUnique for complete sukuk
    vi.mocked(prisma.investment.findUnique).mockResolvedValue(completeSukuk as any)

    const request = createMockRequest({
      method: 'POST',
      body: validSukukData,
    })

    const response = await POST(request)
    const data = await getResponseJson(response)

    expect(response.status).toBe(201)
    expect(data.success).toBe(true)
    expect(data.sukuk).toBeDefined()
    expect(data.sukuk.name).toBe('Test Sukuk')
    expect(requireModuleAccess).toHaveBeenCalledWith('sukuk')
  })

  it('should return 400 for invalid data', async () => {
    vi.mocked(requireModuleAccess).mockResolvedValue(mockUser as any)

    const invalidData = {
      accountId: 'account-1',
      // Missing required field: name
      principalAmount: 100000,
      startDate: '2024-01-01',
    }

    const request = createMockRequest({
      method: 'POST',
      body: invalidData,
    })

    const response = await POST(request)
    const data = await getResponseJson(response)

    expect(response.status).toBe(400)
    expect(data.error).toBe('Validation failed')
    expect(data.details).toBeDefined()
  })

  it('should return 404 if account not found', async () => {
    vi.mocked(requireModuleAccess).mockResolvedValue(mockUser as any)
    vi.mocked(prisma.account.findUnique).mockResolvedValue(null)

    const request = createMockRequest({
      method: 'POST',
      body: validSukukData,
    })

    const response = await POST(request)
    const data = await getResponseJson(response)

    expect(response.status).toBe(404)
    expect(data.error).toBe('Account not found')
  })

  it('should return 401 for unauthorized users', async () => {
    vi.mocked(requireModuleAccess).mockRejectedValue(new Error('Unauthorized'))

    const request = createMockRequest({
      method: 'POST',
      body: validSukukData,
    })

    const response = await POST(request)
    const data = await getResponseJson(response)

    expect(response.status).toBe(401)
    expect(data.error).toBe('Unauthorized')
  })

  it('should return 403 for non-owner users', async () => {
    vi.mocked(requireModuleAccess).mockRejectedValue(new Error('Forbidden'))

    const request = createMockRequest({
      method: 'POST',
      body: validSukukData,
    })

    const response = await POST(request)
    const data = await getResponseJson(response)

    expect(response.status).toBe(403)
    expect(data.error).toBe('Forbidden')
  })

  it('should create sukuk with participants', async () => {
    vi.mocked(requireModuleAccess).mockResolvedValue(mockUser as any)
    vi.mocked(prisma.account.findUnique).mockResolvedValue(mockAccount as any)

    const dataWithParticipants = {
      ...validSukukData,
      participants: [
        {
          personId: 'person-1',
          investedAmount: 50000,
          sharePercentage: 50,
          notes: 'Partner 1',
        },
        {
          personId: 'person-2',
          investedAmount: 50000,
          sharePercentage: 50,
          notes: 'Partner 2',
        },
      ],
    }

    const createdSukuk = {
      id: 'sukuk-1',
      ...validSukukData,
      startDate: new Date('2024-01-01'),
      maturityDate: new Date('2025-01-01'),
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const completeSukuk = {
      ...createdSukuk,
      account: mockAccount,
      dealParticipants: dataWithParticipants.participants.map((p, i) => ({
        id: `participant-${i + 1}`,
        investmentId: 'sukuk-1',
        ...p,
        currentValue: p.investedAmount,
        profit: 0,
        person: { id: p.personId, name: `Person ${i + 1}` },
      })),
    }

    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
      return callback({
        investment: {
          create: vi.fn().mockResolvedValue(createdSukuk),
          update: vi.fn().mockResolvedValue(createdSukuk),
        },
        dealParticipant: {
          createMany: vi.fn(),
        },
        account: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'cash-account',
            name: 'Cash Balance',
            currency: 'SAR',
            type: 'CASH',
          }),
          create: vi.fn(),
        },
        systemSetting: {
          findUnique: vi.fn().mockResolvedValue({
            key: 'CASH_BALANCE',
            value: '1000000',
          }),
          update: vi.fn(),
          create: vi.fn(),
          upsert: vi.fn().mockResolvedValue({
            key: 'CASH_BALANCE',
            value: '900000',
          }),
        },
        cashBucket: {
          aggregate: vi.fn().mockResolvedValue({
            _sum: { balance: 200000 },
          }),
        },
        transaction: {
          create: vi.fn(),
          aggregate: vi.fn().mockResolvedValue({
            _sum: { amount: 200000 },
          }),
        },
        investmentBucketAllocation: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      })
    })

    vi.mocked(prisma.investment.findUnique).mockResolvedValue(completeSukuk as any)

    const request = createMockRequest({
      method: 'POST',
      body: dataWithParticipants,
    })

    const response = await POST(request)
    const data = await getResponseJson(response)

    expect(response.status).toBe(201)
    expect(data.success).toBe(true)
    expect(data.sukuk.dealParticipants).toHaveLength(2)
  })

  it('should validate principalAmount is positive', async () => {
    vi.mocked(requireModuleAccess).mockResolvedValue(mockUser as any)

    const invalidData = {
      ...validSukukData,
      principalAmount: -1000, // Negative amount
    }

    const request = createMockRequest({
      method: 'POST',
      body: invalidData,
    })

    const response = await POST(request)
    const data = await getResponseJson(response)

    expect(response.status).toBe(400)
    expect(data.error).toBe('Validation failed')
  })

  it('should validate startDate is a valid date', async () => {
    vi.mocked(requireModuleAccess).mockResolvedValue(mockUser as any)

    const invalidData = {
      ...validSukukData,
      startDate: 'invalid-date',
    }

    const request = createMockRequest({
      method: 'POST',
      body: invalidData,
    })

    const response = await POST(request)
    const data = await getResponseJson(response)

    expect(response.status).toBe(400)
    expect(data.error).toBe('Validation failed')
  })
})
