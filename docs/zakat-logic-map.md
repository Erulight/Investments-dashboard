# Zakat Calculation System - Complete Logic Flow Map

## Overview
This document maps every path money can take through the system and how the 354-day hawl (Zakat eligibility cycle) is tracked at each step.

---

## 1. CASH RECEIVED

### 1.1 Manual CASH_IN Entry
```
Manual Cash Entry (CASH_IN transaction)
  └── Creates CashBucket
        ├── haulStartDate = entry date
        ├── excludeFromZakat = false
        └── After 354 days from entry → ZAKAT DUE on idle balance
```

### 1.2 Savings/ROSCA Monthly Contribution
```
Monthly Contribution Payment
  └── Creates CashBucket per month
        ├── label = "Circlys • {name} • {month}"
        ├── haulStartDate = firstContributionDate (shared anchor)
        ├── excludeFromZakat = true (temporary tracking bucket)
        └── NO zakat on individual monthly buckets
```

### 1.3 Savings Receipt (Final Payout)
```
Savings Receipt (receive endpoint)
  ├── Consolidates all monthly buckets
  ├── Creates "Savings Receipt • {name}" bucket
  │     ├── haulStartDate = firstContributionDate
  │     ├── excludeFromZakat = false
  │     └── balance = total contribution amount
  │
  ├── Marks monthly buckets as excludeFromZakat = true
  │
  └── Hawl Continuity Logic:
        ├── If (receiptDate - firstContributionDate) >= 354 days
        │     └── ZAKAT DUE IMMEDIATELY on receipt
        │
        └── If < 354 days
              └── Hawl continues from firstContributionDate
                    └── Zakat due when total elapsed >= 354 days
```

### 1.4 Circlys Reward Receipt
```
Reward Receipt (at end of ROSCA plan)
  ├── Consolidates legacy monthly reward buckets (if any)
  ├── Creates "Circlys Reward Receipt • {name}" bucket
  │     ├── haulStartDate = rewardHawlAnchor
  │     │     └── rewardHawlAnchor = firstContributionDate + (completed 354-day cycles)
  │     ├── excludeFromZakat = false
  │     └── balance = total reward amount
  │
  └── Hawl Continuity:
        ├── First hawl completes at end of contribution period
        ├── If reward sits idle after receipt → additional hawl cycles accrue
        └── When invested in Sukuk → inherits last completed hawl anchor
```

### 1.5 Partner Cash Transfer
```
Partner Receives Cash (from owner or commission)
  └── Creates CashBucket
        ├── personId = partner.personId
        ├── haulStartDate = transfer date
        ├── excludeFromZakat = false
        └── After 354 days → ZAKAT DUE (partner-scoped)
```

### 1.6 Debt Payment Received
```
Debt Payment Received
  └── Credits existing debt bucket
        ├── Debt buckets are excludeFromZakat = true
        └── NO zakat on debt buckets (liability, not asset)
```

---

## 2. CASH → INVEST IN SUKUK

### 2.1 Normal Cash Invested
```
Sukuk Created with General Cash
  ├── withdrawFromBuckets() deducts from available cash
  ├── Creates InvestmentBucketAllocation records
  │     ├── principalAllocated = amount from each bucket
  │     └── principalRemaining = amount still in Sukuk
  │
  └── Sukuk Principal Hawl Start:
        ├── Uses bucket.haulStartDate from funding source
        ├── If multiple buckets → earliest haulStartDate wins
        └── Fallback → Sukuk startDate
```

### 2.2 ROSCA Reward Invested
```
Sukuk Created with "Circlys Reward Receipt •" Bucket
  ├── withdrawFromBuckets() with preferredLabelPrefixes
  │     └── Prefers: ['Circlys Reward Receipt •', 'Savings Receipt •']
  │
  ├── Reads bucket.haulStartDate = rewardHawlAnchor
  │     └── rewardHawlAnchor = firstContributionDate + completed cycles
  │
  ├── Computes lastCompletedHawlAnchor(rewardHawlAnchor, sukukStartDate)
  │     └── If reward sat idle for additional cycles, inherits end of last cycle
  │
  └── Stores in investment.metadata.savingsHaulStartDate
        └── Zakat page uses this for principal hawl tracking
```

### 2.3 Savings Receipt Invested
```
Sukuk Created with "Savings Receipt •" Bucket
  ├── Similar to reward logic
  ├── bucket.haulStartDate = firstContributionDate
  ├── Computes lastCompletedHawlAnchor(firstContributionDate, sukukStartDate)
  └── Stores in investment.metadata.savingsHaulStartDate
```

### 2.4 Recycled Sukuk Principal Invested
```
Sukuk Created with "Sukuk Principal •" Bucket
  ├── Previous Sukuk principal receipt bucket
  ├── Starts NEW independent hawl cycle
  ├── Does NOT inherit ROSCA hawl continuity
  └── Principal hawl = new Sukuk startDate
```

### 2.5 Partner Creates Sukuk Deal
```
Partner Creates Sukuk (user.role = PARTNER)
  ├── Uses partner-scoped cash buckets (personId = partner.personId)
  ├── Creates deal with partner as participant
  ├── Owner may have commission plan configured
  └── Principal hawl = partner's bucket haulStartDate
```

---

## 3. SUKUK ACTIVE PERIOD

### 3.1 Principal Hawl Tracking
```
Sukuk Principal (while active)
  ├── Zakat Page Reconciliation (runs on page load):
  │     ├── Reads InvestmentBucketAllocation records
  │     ├── Checks for ROSCA funding (Reward/Savings Receipt buckets)
  │     ├── Computes lastCompletedHawlAnchor from bucket.haulStartDate to sukukStartDate
  │     └── Updates investment.metadata.savingsHaulStartDate
  │
  └── Zakat Calculation:
        ├── Uses metadata.savingsHaulStartDate if present
        ├── Fallback → investment.startDate
        └── Generates Zakat rows for each completed 354-day cycle
              └── Amount = principalRemaining (from allocations)
```

### 3.2 Profit Hawl Tracking
```
Sukuk Profit (accrued but not withdrawn)
  ├── Profit hawl ALWAYS starts from investment.startDate
  ├── NOT affected by ROSCA continuity
  └── Zakat due on accrued profit after 354 days from start
```

### 3.3 Profit Withdrawal (Partial)
```
Withdraw Profit (WITHDRAW_PROFIT)
  ├── Creates "Profit • {name}" bucket (if not exists)
  │     ├── haulStartDate = investment.startDate
  │     └── excludeFromZakat = false
  │
  ├── Credits bucket with withdrawn amount
  ├── Updates investment.totalReceived
  └── Withdrawn profit → normal idle cash hawl rules apply
```

### 3.4 Principal Withdrawal (Partial)
```
Withdraw Principal (WITHDRAW_PRINCIPAL)
  ├── Reduces InvestmentBucketAllocation.principalRemaining
  ├── Creates "Sukuk Principal • {name}" bucket
  │     ├── haulStartDate = inherited from allocation source
  │     └── excludeFromZakat = false
  │
  └── Withdrawn principal → can be reinvested (starts new cycle)
```

---

## 4. SUKUK MATURES / CLOSES

### 4.1 Full Withdrawal (Close Deal)
```
Sukuk Withdrawal (full close)
  ├── Principal Receipt:
  │     ├── Creates "Sukuk Principal • {name}" bucket
  │     ├── haulStartDate = inherited from allocation source
  │     │     └── If ROSCA-funded → uses metadata.savingsHaulStartDate
  │     │     └── Else → investment.startDate
  │     └── balance = principalAmount
  │
  ├── Profit Receipt:
  │     ├── Creates "Profit • {name}" bucket
  │     ├── haulStartDate = investment.startDate
  │     └── balance = receivableAmount
  │
  └── Both buckets:
        ├── excludeFromZakat = false
        └── Normal idle cash hawl rules apply going forward
```

### 4.2 Partner Commission Payout
```
Partner Commission (on partner-created deal)
  ├── Triggered when partner withdraws profit
  ├── Creates owner commission bucket
  │     ├── label = "Commission • {name}"
  │     ├── haulStartDate = commissionPlan.issuedAt (fallback: payout date)
  │     └── balance = commission amount
  │
  └── Commission → normal idle cash hawl rules
```

---

## 5. SUKUK SELL TO PARTNER

### 5.1 Owner Sells to Partner
```
Sell Sukuk to Partner (SELL_TO_PARTNER)
  ├── Owner receives sale price immediately
  │     ├── Creates "Sukuk Principal • {name}" bucket
  │     ├── haulStartDate = inherited from allocation source
  │     └── balance = salePrice
  │
  ├── Partner becomes new owner
  │     ├── DealParticipant created with partner.personId
  │     └── Partner's principal hawl = acquiredAt date
  │
  └── Accrued profit at sale:
        ├── Recorded as SELL_PROFIT_ACCRUED transaction
        ├── Owner can receive later via /receive endpoint
        └── Creates profit bucket when received
```

### 5.2 Sold Deal Receipt (Owner)
```
Receive Profit from Sold Deal
  ├── Creates "Profit • {name}" bucket
  │     ├── haulStartDate = investment.startDate
  │     └── balance = accruedProfitAtSale
  │
  └── Updates investment.totalReceived
```

---

## 6. SUKUK REOPEN

### 6.1 Reopen After Close
```
Reopen Sukuk Deal
  ├── Reverses WITHDRAW_PRINCIPAL movements
  ├── Restores InvestmentBucketAllocation.principalRemaining
  │     ├── Reads WITHDRAW_PRINCIPAL/ROLLBACK_PRINCIPAL movements
  │     ├── Caps restoration at principalAllocated per allocation
  │     └── Redistributes overflow if needed
  │
  ├── Reverses WITHDRAW_PROFIT movements
  ├── Deletes receipt bucket movements (CASH_IN)
  ├── Reduces receipt bucket balances
  └── Recomputes CASH_BALANCE for owner and affected partners
```

---

## 7. PARTNER-SPECIFIC FLOWS

### 7.1 Partner Idle Cash
```
Partner Cash Balance
  ├── Scoped by personId = partner.personId
  ├── Separate cash buckets from owner
  └── Zakat calculated independently for partner
        ├── Partner sees only their buckets
        └── Partner Zakat page filters: personId = partner.personId
```

### 7.2 Partner Legacy Cash Sync
```
Partner with CASH_BALANCE but No Buckets
  ├── Zakat page detects mismatch
  ├── Creates "Partner Legacy Cash Sync" bucket
  │     ├── haulStartDate = earliest partner CASH tx date (fallback: today)
  │     ├── balance = net CASH_BALANCE
  │     └── excludeFromZakat = false
  │
  └── Recomputes CASH_BALANCE setting
```

### 7.3 Partner Sukuk Participation
```
Partner Participates in Sukuk
  ├── DealParticipant record created
  │     ├── personId = partner.personId
  │     ├── investedAmount = partner principal
  │     └── profit = partner's share of profit
  │
  ├── Partner withdrawals:
  │     ├── Creates partner-scoped receipt buckets (personId = partner.personId)
  │     ├── haulStartDate = acquiredAt (when partner joined deal)
  │     └── Zakat tracked separately from owner
  │
  └── Partner commission (if partner created deal):
        └── Owner receives commission → owner's cash bucket
```

---

## 8. DEBT FLOWS

### 8.1 Debt Created
```
Create Debt
  ├── Creates CashBucket
  │     ├── label = "Debt • {name}"
  │     ├── excludeFromZakat = true (liability, not asset)
  │     └── balance = debt amount (negative)
  │
  └── NO zakat on debt buckets
```

### 8.2 Debt Payment
```
Pay Debt
  ├── Deducts from general cash buckets
  ├── Credits debt bucket (reduces negative balance)
  └── When fully paid:
        ├── Debt bucket balance = 0
        └── Can be archived/excluded
```

---

## 9. ZAKAT PAYMENT

### 9.1 Zakat Paid
```
Pay Zakat
  ├── Deducts from general cash buckets
  ├── Creates ZAKAT_PAYMENT transaction
  ├── Updates bucket.lastZakatPaidDate
  └── Zakat page suppresses rows already paid
```

---

## 10. ZAKAT PAGE RECONCILIATION LOGIC

### 10.1 Sukuk Hawl Anchor Reconciliation (runs on page load)
```
For Each Sukuk Investment:
  ├── Fetch InvestmentBucketAllocation records
  ├── Fetch CashBucketMovement (INVEST_OUT) records
  │
  ├── Check for ROSCA funding:
  │     ├── "Circlys Reward Receipt •" buckets
  │     └── "Savings Receipt •" buckets
  │
  ├── If ROSCA funding found:
  │     ├── Read bucket.haulStartDate
  │     ├── Compute lastCompletedHawlAnchor(bucket.haulStartDate, sukukStartDate)
  │     │     └── Finds end of last completed 354-day cycle before Sukuk start
  │     └── Store in investment.metadata.savingsHaulStartDate
  │
  ├── If recycled principal funding:
  │     └── Use principal bucket haulStartDate (independent cycle)
  │
  └── Fallback:
        └── Use investment.startDate or CASH_INVEST tx date
```

### 10.2 Receipt Bucket Suppression
```
Suppress Fully-Invested Receipt Buckets:
  ├── For each ROSCA allocation with balance <= 0.01
  │     └── Mark bucket as excludeFromZakat = true
  │
  └── Prevents double-counting:
        ├── Receipt bucket shows idle Zakat
        └── Sukuk principal shows active Zakat
        └── If receipt fully moved → suppress idle rows
```

### 10.3 Idle Cash Hawl Calculation
```
For Each Qualifying Receipt Bucket:
  ├── Check if receipt was reinvested (INVEST_OUT movements after receipt)
  ├── If fully reinvested → skip idle rows (avoid double-counting)
  │
  └── If not fully reinvested:
        ├── Determine idleAnchorStart:
        │     ├── If receipt completed first hawl (>=354 days) → receiptDay
        │     └── Else → eligibilityStart (continuity from first contribution)
        │
        ├── Calculate completedIdleHauls = floor(elapsed / 354)
        │
        └── Generate Zakat row for each completed idle hawl:
              ├── periodStart = idleAnchorStart + (i * 354)
              ├── periodEnd = idleAnchorStart + ((i+1) * 354)
              └── amount = min(bucket.balance, poolOutstanding)
```

---

## 11. DASHBOARD PROFIT STATS

### 11.1 Total Profit Calculation
```
Total Profit = Commission Earned + Rewards + Received + Receivable

Where:
  ├── Commission Earned:
  │     ├── PARTNER_COMMISSION transactions (owner receiving)
  │     └── Sell commission metadata
  │
  ├── Rewards:
  │     └── Circlys profit = currentValue - principalAmount
  │
  ├── Received:
  │     ├── WITHDRAW_PROFIT transactions
  │     ├── investment.totalReceived field
  │     └── Legacy WITHDRAW_PRINCIPAL with metadata.source = 'PROFIT'
  │
  └── Receivable:
        └── Accrued profit not yet withdrawn
```

---

## 12. KEY HELPER FUNCTIONS

### 12.1 getLastCompletedHawlAnchor
```typescript
getLastCompletedHawlAnchor(initialAnchor: Date, referenceDate: Date): Date
  ├── Calculates days elapsed from initialAnchor to referenceDate
  ├── If elapsed < 354 → return initialAnchor
  └── Else:
        ├── completedCycles = floor(elapsed / 354)
        └── return initialAnchor + (completedCycles * 354 days)
```

### 12.2 withdrawFromBuckets
```typescript
withdrawFromBuckets(amount, options)
  ├── Finds available cash buckets matching criteria:
  │     ├── currency match
  │     ├── balance > 0
  │     ├── personId match (if specified)
  │     ├── haulStartDate <= availableOnOrBefore
  │     └── Excludes/prefers labels as specified
  │
  ├── Sorts buckets by preference:
  │     ├── Preferred labels first (by index order)
  │     └── Then by haulStartDate (oldest first)
  │
  ├── Deducts from each bucket until amount satisfied
  ├── Creates CashBucketMovement (INVEST_OUT, CASH_OUT, etc.)
  │
  └── If allocateToInvestment = true:
        └── Creates InvestmentBucketAllocation records
```

### 12.3 creditBucketsForReceipt
```typescript
creditBucketsForReceipt(amount, principalReduction, options)
  ├── Creates receipt buckets based on type:
  │     ├── WITHDRAW_PRINCIPAL → "Sukuk Principal • {name}"
  │     └── WITHDRAW_PROFIT → "Profit • {name}"
  │
  ├── Inherits haulStartDate:
  │     ├── Principal → from allocation source or metadata.savingsHaulStartDate
  │     └── Profit → from profitHaulStartDate option or investment.startDate
  │
  ├── Creates CashBucketMovement (CASH_IN)
  └── Updates InvestmentBucketAllocation.principalRemaining (if principal)
```

---

## 13. CRITICAL RULES

### 13.1 Hawl Continuity Rules
1. **ROSCA Contributions**: Individual monthly buckets are `excludeFromZakat = true`. No Zakat until receipt.
2. **ROSCA Receipt**: Hawl starts from `firstContributionDate`, NOT receipt date.
3. **Reward Receipt**: Hawl anchor = `firstContributionDate + completed cycles` at receipt time.
4. **Reward → Sukuk**: Sukuk inherits `lastCompletedHawlAnchor` from reward bucket, preserving idle cycles.
5. **Recycled Principal**: Starts NEW independent cycle. Does NOT inherit ROSCA continuity.
6. **Profit**: ALWAYS starts from investment.startDate, never inherits ROSCA continuity.

### 13.2 Double-Counting Prevention
1. **Receipt Fully Invested**: If receipt bucket balance = 0, mark `excludeFromZakat = true`.
2. **Idle After Reinvestment**: Check INVEST_OUT movements after receipt. If fully reinvested, skip idle rows.
3. **Monthly Contributions**: Marked `excludeFromZakat = true` to avoid counting before receipt.

### 13.3 Partner Scoping
1. **Cash Buckets**: Partner buckets have `personId = partner.personId`.
2. **Zakat Calculation**: Partner Zakat page filters all queries by `personId`.
3. **Receipt Buckets**: Partner receipts are scoped to partner, owner receipts to owner (personId = null).
4. **Commission**: Owner commission from partner deals → owner's cash (personId = null).

### 13.4 Metadata Persistence
1. **Sukuk Hawl Start**: Stored in `investment.metadata.savingsHaulStartDate` (ISO date string).
2. **Zakat Page Reconciliation**: Updates metadata on page load to ensure consistency.
3. **Commission Plan**: Stored in `investment.metadata.partnerCommissionPlan` for partner-created deals.

---

## 14. COMMON SCENARIOS

### Scenario A: ROSCA → Idle → Sukuk
```
Day 0: Start ROSCA (12 months, SAR 1000/month)
  └── Creates monthly buckets (excludeFromZakat = true)

Day 365: Receive ROSCA (after 12 months)
  ├── Creates "Savings Receipt • Plan" bucket
  │     ├── haulStartDate = Day 0 (firstContributionDate)
  │     ├── balance = SAR 12,000
  │     └── Zakat DUE immediately (365 days > 354)
  │
  └── Zakat Page shows:
        └── Row: "Savings Receipt • Plan" | SAR 12,000 | Due: Day 354

Day 400: Invest SAR 12,000 in Sukuk
  ├── Sukuk funded from "Savings Receipt • Plan" bucket
  ├── Computes lastCompletedHawlAnchor(Day 0, Day 400) = Day 354
  ├── Stores metadata.savingsHaulStartDate = Day 354
  │
  └── Sukuk principal hawl:
        ├── First cycle: Day 354 → Day 708 (354 days)
        └── NOT Day 400 → Day 754 (would lose 46 days of idle period)
```

### Scenario B: Reward → Idle → Sukuk
```
Day 0: Start ROSCA with rewards
Day 365: Receive reward (SAR 1,200)
  ├── rewardHawlAnchor = getLastCompletedHawlAnchor(Day 0, Day 365) = Day 354
  ├── Creates "Circlys Reward Receipt • Plan" bucket
  │     ├── haulStartDate = Day 354
  │     └── balance = SAR 1,200
  │
  └── Zakat DUE on Day 708 (Day 354 + 354)

Day 500: Reward sits idle (no action)
  └── Idle period: Day 365 → Day 500 (135 days)

Day 800: Invest reward in Sukuk
  ├── Elapsed from Day 354 → Day 800 = 446 days
  ├── Completed cycles = floor(446 / 354) = 1
  ├── lastCompletedHawlAnchor = Day 354 + 354 = Day 708
  │
  └── Sukuk principal hawl:
        ├── Inherits Day 708 as hawl start
        ├── Next Zakat due: Day 708 + 354 = Day 1062
        └── Idle Zakat (Day 708) was already due and should have been paid
```

### Scenario C: Partner Creates Deal, Owner Receives Commission
```
Day 0: Partner creates Sukuk (SAR 10,000 principal, 10% profit, 5% owner commission)
  ├── Partner invests from partner cash buckets
  ├── Commission plan stored in metadata:
  │     ├── partnerCommissionPlan.amount = SAR 500
  │     ├── partnerCommissionPlan.issuedAt = Day 0
  │     └── partnerCommissionPlan.partnerNetReceivable = SAR 500 (profit - commission)
  │
  └── No commission paid yet

Day 365: Partner withdraws profit (SAR 500)
  ├── Partner receives SAR 500 profit
  ├── Owner commission triggered:
  │     ├── Proportional payout = (500 / 500) * 500 = SAR 500
  │     ├── Creates owner commission bucket:
  │     │     ├── label = "Commission • Deal"
  │     │     ├── haulStartDate = Day 0 (issuedAt)
  │     │     └── balance = SAR 500
  │     │
  │     └── Owner Zakat due: Day 0 + 354 = Day 354 (already passed)
  │
  └── Partner Zakat:
        ├── Partner profit bucket: haulStartDate = Day 0 (acquiredAt)
        └── Zakat due: Day 354
```

---

## 15. TROUBLESHOOTING GUIDE

### Issue: "Zakat not showing for partner idle cash"
**Check:**
1. Partner has cash buckets with `personId = partner.personId`
2. Buckets are `excludeFromZakat = false`
3. `haulStartDate` is at least 354 days ago
4. Zakat page is filtering correctly by `personId`

**Fix:** Run partner legacy cash sync logic in Zakat page.

### Issue: "Reward hawl resets when invested in Sukuk"
**Check:**
1. Reward bucket `haulStartDate` = `rewardHawlAnchor` (not receipt date)
2. Sukuk create route computes `lastCompletedHawlAnchor`
3. Zakat page reconciliation updates `metadata.savingsHaulStartDate`

**Fix:** Ensure `getLastCompletedHawlAnchor` is called in both Sukuk create and Zakat reconciliation.

### Issue: "Double-counting Zakat on receipt and Sukuk principal"
**Check:**
1. Receipt bucket balance after investment
2. `excludeFromZakat` flag on receipt bucket
3. Idle row suppression logic in Zakat page

**Fix:** Mark fully-invested receipt buckets as `excludeFromZakat = true`.

### Issue: "Profit stats not including received amounts"
**Check:**
1. `investment.totalReceived` field is updated on withdrawals
2. Dashboard aggregates `WITHDRAW_PROFIT` transactions
3. Legacy `WITHDRAW_PRINCIPAL` with `metadata.source = 'PROFIT'` is included

**Fix:** Use `Math.max(txSum, totalReceived)` to capture both sources.

---

## 16. FUTURE ENHANCEMENTS

### Potential Improvements:
1. **Bucket Metadata Field**: Add `metadata` column to `CashBucket` schema to store `firstContributionDate` and `rewardHawlAnchor` explicitly.
2. **Hawl Audit Trail**: Log all hawl anchor changes for debugging.
3. **Automated Zakat Reminders**: Notify users when Zakat becomes due.
4. **Multi-Currency Zakat**: Support Zakat calculation across different currencies with exchange rates.
5. **Zakat Payment History**: Detailed report of all Zakat payments with receipts.

---

**Document Version:** 1.0  
**Last Updated:** 2026-03-11  
**Maintained By:** Cascade AI Assistant
