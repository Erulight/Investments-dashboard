import { describe, it, expect, beforeEach } from 'vitest'
import { 
  calculateZakat, 
  createInvestmentRecord, 
  adjustForRollingInvestments,
  applySukukTypeGate,
  applyDurationGate,
  calculateHawlStartDate,
  hasCompletedHijriYear,
  diffHijriDays,
  addHijriDays,
  InvestmentRecord,
  SukukType
} from '../lib/zakat'

describe('Zakat Calculation Engine', () => {
  const baseDate = new Date('2024-01-01')
  const userZakatDate = new Date('2024-12-31')

  describe('Rule 1: Sukuk Type Gate', () => {
    it('should exempt Ijarah sukuk from Zakat', () => {
      const record: InvestmentRecord = {
        sukuk_type: 'IJARAH',
        funds_ownership_date: new Date('2023-01-01'),
        investment_date: new Date('2023-01-01'),
        user_zakat_annual_date: userZakatDate,
        distributions: [{ receipt_date: new Date('2024-06-01'), amount: 5000 }],
        redemption_date: undefined,
        redemption_amount: 0,
        is_defaulted: false,
        principal_amount: 100000,
        investment_id: 'test-1',
        name: 'Test Ijarah Sukuk'
      }

      const result = calculateZakat([record], baseDate)
      
      expect(result.total_zakat_due).toBe(0)
      expect(result.breakdown[0].reason).toContain('Rule 1: Ijarah sukuk')
      expect(result.rules_applied).toContain('Rule 1: Ijarah sukuk - Zakat = 0')
    })

    it('should proceed with Murabaha sukuk calculation', () => {
      const gate = applySukukTypeGate({
        sukuk_type: 'MURABAHA'
      } as InvestmentRecord)

      expect(gate.passes).toBe(true)
      expect(gate.reason).toContain('Murabaha sukuk - proceed')
    })
  })

  describe('Rule 2: Duration Gate', () => {
    it('should exempt investments held less than 354 days', () => {
      const record: InvestmentRecord = {
        sukuk_type: 'MURABAHA',
        funds_ownership_date: new Date('2023-06-01'), // ~214 days before baseDate
        investment_date: new Date('2023-06-01'),
        user_zakat_annual_date: userZakatDate,
        distributions: [{ receipt_date: new Date('2024-06-01'), amount: 5000 }],
        redemption_date: undefined,
        redemption_amount: 0,
        is_defaulted: false,
        principal_amount: 100000,
        investment_id: 'test-2',
        name: 'Test Short-Term Sukuk'
      }

      const result = calculateZakat([record], baseDate)
      
      expect(result.total_zakat_due).toBe(0)
      expect(result.breakdown[0].reason).toContain('Rule 2: Investment period')
      expect(result.breakdown[0].reason).toContain('< 354 days')
    })

    it('should proceed with investments held 354+ days', () => {
      const record: InvestmentRecord = {
        sukuk_type: 'MURABAHA',
        funds_ownership_date: new Date('2022-12-01'), // ~396 days before baseDate
        investment_date: new Date('2022-12-01'),
        user_zakat_annual_date: userZakatDate,
        distributions: [],
        redemption_date: undefined,
        redemption_amount: 0,
        is_defaulted: false,
        principal_amount: 100000,
        investment_id: 'test-3',
        name: 'Test Long-Term Sukuk'
      }

      const gate = applyDurationGate(record, baseDate)
      
      expect(gate.passes).toBe(true)
      expect(gate.reason).toContain('>= 354 days - proceed')
    })
  })

  describe('Rule 3: Zakat Rate', () => {
    it('should calculate 2.5% on distributed cash amounts', () => {
      const record: InvestmentRecord = {
        sukuk_type: 'MURABAHA',
        funds_ownership_date: new Date('2022-01-01'), // Well over 354 days
        investment_date: new Date('2022-01-01'),
        user_zakat_annual_date: userZakatDate,
        distributions: [
          { receipt_date: new Date('2024-02-01'), amount: 10000 }, // After hawl completion
          { receipt_date: new Date('2024-06-01'), amount: 5000 }
        ],
        redemption_date: undefined,
        redemption_amount: 0,
        is_defaulted: false,
        principal_amount: 200000,
        investment_id: 'test-4',
        name: 'Test Distribution Sukuk'
      }

      const result = calculateZakat([record], baseDate)
      
      // Should calculate 2.5% on total distributions (15000)
      const expectedZakat = 15000 * 0.025 // 375
      expect(result.total_zakat_due).toBe(expectedZakat)
      expect(result.breakdown[0].reason).toContain('Rule 3: 2.5%')
    })
  })

  describe('Rule 4: Hawl Start Date', () => {
    it('should use earlier of funds ownership or investment date', () => {
      const fundsDate = new Date('2022-06-01')
      const investmentDate = new Date('2022-08-01')

      const record1: InvestmentRecord = {
        funds_ownership_date: fundsDate,
        investment_date: investmentDate,
        sukuk_type: 'MURABAHA',
        user_zakat_annual_date: userZakatDate,
        distributions: [],
        redemption_date: undefined,
        redemption_amount: 0,
        is_defaulted: false,
        principal_amount: 100000,
        investment_id: 'test-5a',
        name: 'Test Hawl Start A'
      }

      const record2: InvestmentRecord = {
        funds_ownership_date: investmentDate,
        investment_date: fundsDate,
        sukuk_type: 'MURABAHA',
        user_zakat_annual_date: userZakatDate,
        distributions: [],
        redemption_date: undefined,
        redemption_amount: 0,
        is_defaulted: false,
        principal_amount: 100000,
        investment_id: 'test-5b',
        name: 'Test Hawl Start B'
      }

      const hawlStart1 = calculateHawlStartDate(record1)
      const hawlStart2 = calculateHawlStartDate(record2)

      expect(hawlStart1).toEqual(fundsDate) // Earlier date
      expect(hawlStart2).toEqual(fundsDate) // Earlier date
    })
  })

  describe('Rule 5: Hijri Calendar', () => {
    it('should use 354-day lunar year calculations', () => {
      const startDate = new Date('2023-01-01')
      const endDate = addHijriDays(startDate, 354)
      
      const daysDiff = diffHijriDays(startDate, endDate)
      expect(daysDiff).toBe(354)
      
      const hawlCompleted = hasCompletedHijriYear(startDate, endDate)
      expect(hawlCompleted).toBe(true)
      
      const almostComplete = addHijriDays(startDate, 353)
      const notCompleted = hasCompletedHijriYear(startDate, almostComplete)
      expect(notCompleted).toBe(false)
    })
  })

  describe('Rule 6: Zakat Trigger', () => {
    it('should only calculate Zakat on actual cash receipts', () => {
      const record: InvestmentRecord = {
        sukuk_type: 'MURABAHA',
        funds_ownership_date: new Date('2022-01-01'),
        investment_date: new Date('2022-01-01'),
        user_zakat_annual_date: userZakatDate,
        distributions: [
          { receipt_date: new Date('2024-02-01'), amount: 5000 }, // Actual receipt
          { receipt_date: new Date('2025-06-01'), amount: 3000 }  // Future receipt
        ],
        redemption_date: undefined,
        redemption_amount: 0,
        is_defaulted: false,
        principal_amount: 100000,
        investment_id: 'test-6',
        name: 'Test Cash Receipt Trigger'
      }

      const result = calculateZakat([record], baseDate)
      
      // Should only calculate on the 5000 received, not the future 3000
      const expectedZakat = 5000 * 0.025 // 125
      expect(result.total_zakat_due).toBe(expectedZakat)
    })
  })

  describe('Rule 9: Spent Distributions', () => {
    it('should exempt spent distributions from Zakat', () => {
      const record: InvestmentRecord = {
        sukuk_type: 'MURABAHA',
        funds_ownership_date: new Date('2022-01-01'),
        investment_date: new Date('2022-01-01'),
        user_zakat_annual_date: userZakatDate,
        distributions: [
          { receipt_date: new Date('2024-02-01'), amount: 5000, is_spent_before_zakat_date: true },
          { receipt_date: new Date('2024-06-01'), amount: 3000, is_spent_before_zakat_date: false }
        ],
        redemption_date: undefined,
        redemption_amount: 0,
        is_defaulted: false,
        principal_amount: 100000,
        investment_id: 'test-9',
        name: 'Test Spent Distributions'
      }

      const result = calculateZakat([record], baseDate)
      
      // Should only calculate on the 3000 not spent
      const expectedZakat = 3000 * 0.025 // 75
      expect(result.total_zakat_due).toBe(expectedZakat)
    })
  })

  describe('Rule 11: Early Settlement', () => {
    it('should exempt early settled investments', () => {
      const record: InvestmentRecord = {
        sukuk_type: 'MURABAHA',
        funds_ownership_date: new Date('2023-06-01'),
        investment_date: new Date('2023-06-01'),
        user_zakat_annual_date: userZakatDate,
        distributions: [{ receipt_date: new Date('2024-02-01'), amount: 5000 }],
        redemption_date: new Date('2024-03-01'), // Redeemed before 1 year
        redemption_amount: 105000,
        is_defaulted: false,
        principal_amount: 100000,
        investment_id: 'test-11',
        name: 'Test Early Settlement'
      }

      const result = calculateZakat([record], baseDate)
      
      expect(result.total_zakat_due).toBe(0)
      expect(result.breakdown[0].reason).toContain('Rule 11: Early settlement')
    })
  })

  describe('Rule 13: Default/Liquidation', () => {
    it('should exempt defaulted investments', () => {
      const record: InvestmentRecord = {
        sukuk_type: 'MURABAHA',
        funds_ownership_date: new Date('2022-01-01'),
        investment_date: new Date('2022-01-01'),
        user_zakat_annual_date: userZakatDate,
        distributions: [{ receipt_date: new Date('2024-02-01'), amount: 5000 }],
        redemption_date: undefined,
        redemption_amount: 0,
        is_defaulted: true,
        principal_amount: 100000,
        investment_id: 'test-13',
        name: 'Test Defaulted Investment'
      }

      const result = calculateZakat([record], baseDate)
      
      expect(result.total_zakat_due).toBe(0)
      expect(result.breakdown[0].reason).toContain('Rule 13: Company defaulted')
    })
  })

  describe('Rule 14: Rolling Short-Term Investments', () => {
    it('should use original funds ownership date for rolling investments', () => {
      const originalDate = new Date('2022-01-01')
      
      const records: InvestmentRecord[] = [
        {
          sukuk_type: 'MURABAHA',
          funds_ownership_date: originalDate,
          investment_date: new Date('2022-01-01'),
          user_zakat_annual_date: userZakatDate,
          distributions: [{ receipt_date: new Date('2022-05-01'), amount: 2000 }],
          redemption_date: new Date('2022-05-01'),
          redemption_amount: 52000,
          is_defaulted: false,
          principal_amount: 50000,
          investment_id: 'test-14a',
          name: 'Short-Term Sukuk 1'
        },
        {
          sukuk_type: 'MURABAHA',
          funds_ownership_date: new Date('2022-05-01'), // Will be adjusted to originalDate
          investment_date: new Date('2022-05-01'),
          user_zakat_annual_date: userZakatDate,
          distributions: [{ receipt_date: new Date('2022-09-01'), amount: 2000 }],
          redemption_date: new Date('2022-09-01'),
          redemption_amount: 52000,
          is_defaulted: false,
          principal_amount: 50000,
          investment_id: 'test-14b',
          name: 'Short-Term Sukuk 2'
        },
        {
          sukuk_type: 'MURABAHA',
          funds_ownership_date: new Date('2022-09-01'), // Will be adjusted to originalDate
          investment_date: new Date('2022-09-01'),
          user_zakat_annual_date: userZakatDate,
          distributions: [{ receipt_date: new Date('2024-01-01'), amount: 2000 }],
          redemption_date: undefined,
          redemption_amount: 0,
          is_defaulted: false,
          principal_amount: 50000,
          investment_id: 'test-14c',
          name: 'Short-Term Sukuk 3'
        }
      ]

      const adjustedRecords = adjustForRollingInvestments(records)
      const result = calculateZakat(adjustedRecords, baseDate)
      
      // All should use the original date, so hawl should be completed
      // Should calculate Zakat on the final distribution
      expect(result.total_zakat_due).toBeGreaterThan(0)
      expect(adjustedRecords[1].funds_ownership_date).toEqual(originalDate)
      expect(adjustedRecords[2].funds_ownership_date).toEqual(originalDate)
    })
  })

  describe('Integration Tests', () => {
    it('should handle complex multi-investment scenario', () => {
      const records: InvestmentRecord[] = [
        // Valid Murabaha with distributions
        {
          sukuk_type: 'MURABAHA',
          funds_ownership_date: new Date('2022-01-01'),
          investment_date: new Date('2022-01-01'),
          user_zakat_annual_date: userZakatDate,
          distributions: [
            { receipt_date: new Date('2024-02-01'), amount: 10000 },
            { receipt_date: new Date('2024-06-01'), amount: 5000 }
          ],
          redemption_date: undefined,
          redemption_amount: 0,
          is_defaulted: false,
          principal_amount: 200000,
          investment_id: 'integration-1',
          name: 'Valid Murabaha Sukuk'
        },
        // Exempt Ijarah
        {
          sukuk_type: 'IJARAH',
          funds_ownership_date: new Date('2022-01-01'),
          investment_date: new Date('2022-01-01'),
          user_zakat_annual_date: userZakatDate,
          distributions: [{ receipt_date: new Date('2024-02-01'), amount: 8000 }],
          redemption_date: undefined,
          redemption_amount: 0,
          is_defaulted: false,
          principal_amount: 150000,
          investment_id: 'integration-2',
          name: 'Exempt Ijarah Sukuk'
        },
        // Short-term (exempt)
        {
          sukuk_type: 'MURABAHA',
          funds_ownership_date: new Date('2023-06-01'),
          investment_date: new Date('2023-06-01'),
          user_zakat_annual_date: userZakatDate,
          distributions: [{ receipt_date: new Date('2024-02-01'), amount: 3000 }],
          redemption_date: undefined,
          redemption_amount: 0,
          is_defaulted: false,
          principal_amount: 75000,
          investment_id: 'integration-3',
          name: 'Short-Term Murabaha'
        }
      ]

      const result = calculateZakat(records, baseDate)
      
      // Should only calculate Zakat on the first investment (15000 * 0.025 = 375)
      expect(result.total_zakat_due).toBe(375)
      expect(result.breakdown).toHaveLength(3)
      expect(result.breakdown[0].zakat_amount).toBe(375)
      expect(result.breakdown[1].zakat_amount).toBe(0) // Ijarah exempt
      expect(result.breakdown[2].zakat_amount).toBe(0) // Short-term exempt
    })

    it('should provide detailed rule explanations', () => {
      const record: InvestmentRecord = {
        sukuk_type: 'MURABAHA',
        funds_ownership_date: new Date('2022-01-01'),
        investment_date: new Date('2022-01-01'),
        user_zakat_annual_date: userZakatDate,
        distributions: [{ receipt_date: new Date('2024-02-01'), amount: 10000 }],
        redemption_date: undefined,
        redemption_amount: 0,
        is_defaulted: false,
        principal_amount: 100000,
        investment_id: 'explanation-test',
        name: 'Test Explanation'
      }

      const result = calculateZakat([record], baseDate)
      
      expect(result.rules_applied).toContain('Rule 1: Murabaha sukuk - proceed')
      expect(result.rules_applied.length).toBeGreaterThan(0)
      expect(result.breakdown[0].reason).toContain('Rule 3: 2.5%')
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty distributions array', () => {
      const record: InvestmentRecord = {
        sukuk_type: 'MURABAHA',
        funds_ownership_date: new Date('2022-01-01'),
        investment_date: new Date('2022-01-01'),
        user_zakat_annual_date: userZakatDate,
        distributions: [],
        redemption_date: undefined,
        redemption_amount: 0,
        is_defaulted: false,
        principal_amount: 100000,
        investment_id: 'edge-1',
        name: 'No Distributions'
      }

      const result = calculateZakat([record], baseDate)
      
      expect(result.total_zakat_due).toBe(0)
      expect(result.breakdown[0].distributions_subject_to_zakat).toHaveLength(0)
    })

    it('should handle invalid dates gracefully', () => {
      const record: InvestmentRecord = {
        sukuk_type: 'MURABAHA',
        funds_ownership_date: new Date('invalid'),
        investment_date: new Date('2022-01-01'),
        user_zakat_annual_date: userZakatDate,
        distributions: [{ receipt_date: new Date('2024-02-01'), amount: 5000 }],
        redemption_date: undefined,
        redemption_amount: 0,
        is_defaulted: false,
        principal_amount: 100000,
        investment_id: 'edge-2',
        name: 'Invalid Date'
      }

      // Should not throw error and should handle gracefully
      expect(() => calculateZakat([record], baseDate)).not.toThrow()
    })

    it('should handle zero and negative amounts', () => {
      const record: InvestmentRecord = {
        sukuk_type: 'MURABAHA',
        funds_ownership_date: new Date('2022-01-01'),
        investment_date: new Date('2022-01-01'),
        user_zakat_annual_date: userZakatDate,
        distributions: [
          { receipt_date: new Date('2024-02-01'), amount: 0 },
          { receipt_date: new Date('2024-03-01'), amount: -1000 },
          { receipt_date: new Date('2024-04-01'), amount: 5000 }
        ],
        redemption_date: undefined,
        redemption_amount: 0,
        is_defaulted: false,
        principal_amount: 100000,
        investment_id: 'edge-3',
        name: 'Zero and Negative Amounts'
      }

      const result = calculateZakat([record], baseDate)
      
      // Should only calculate on positive amounts (5000)
      expect(result.total_zakat_due).toBe(125) // 5000 * 0.025
    })
  })
})
