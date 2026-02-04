import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '@/app/api/sukuk/create/route'
import { createMockRequest, getResponseJson } from '@/test/utils'

// Mock dependencies
vi.mock('@/lib/rbac', () => ({
  requireAuth: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  prisma: {
    account: {
      findUnique: vi.fn(),
    },
    investment: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    dealParticipant: {
      createMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/audit', () => ({
  logAudit: vi.fn(),
}))

import { requireAuth } from '@/lib/rbac'
import { prisma } from '@/lib/db'

describe('POST /api/sukuk/create', () => {
  const mockUser = {
    id: 'user-1',
    email: 'owner@example.local',
    role: 'OWNER',
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
  })

  it('should successfully create a sukuk with valid data', async () => {
    // Mock auth to return owner user
    vi.mocked(requireAuth).mockResolvedValue(mockUser)

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
        },
        dealParticipant: {
          createMany: vi.fn(),
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
    expect(requireAuth).toHaveBeenCalledWith(['OWNER'])
  })

  it('should return 400 for invalid data', async () => {
    vi.mocked(requireAuth).mockResolvedValue(mockUser)

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
    vi.mocked(requireAuth).mockResolvedValue(mockUser)
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
    vi.mocked(requireAuth).mockRejectedValue(new Error('Unauthorized'))

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
    vi.mocked(requireAuth).mockRejectedValue(new Error('Forbidden'))

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
    vi.mocked(requireAuth).mockResolvedValue(mockUser)
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
        },
        dealParticipant: {
          createMany: vi.fn(),
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
    vi.mocked(requireAuth).mockResolvedValue(mockUser)

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
    vi.mocked(requireAuth).mockResolvedValue(mockUser)

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
