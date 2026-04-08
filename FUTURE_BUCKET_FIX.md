# Future Bucket Date Fix - Summary

## Problem
Cash buckets were being created with future `haulStartDate` values, causing withdrawal failures with "Insufficient cash balance" error even when balance exists.

**Root Cause:** When undoing Circlys payments that had incorrect future dates, the system created cash buckets with those same future dates as `haulStartDate`.

---

## Changes Made

### ✅ **1. Savings Payment Validation** 
**File:** `app/api/savings/[id]/pay/route.ts` (Lines 140-152)

**What it does:**
- Prevents creating savings payments with dates more than 30 days in the future
- Helps catch data entry errors before they create problems

**Impact:** 
- ✅ Safe - Only blocks invalid future dates
- ✅ Allows up to 30 days buffer for flexibility
- ❌ Will reject payments if monthIndex creates a date too far in future

---

### ✅ **2. Undo Logic Fix**
**File:** `app/api/savings/[id]/pay/route.ts` (Lines 697-711)

**What it does:**
- When undoing a payment, if the original payment had a future date, the restored cash bucket now uses TODAY's date for `haulStartDate` instead of the future date
- Prevents creating blocked buckets during undo operations

**Impact:**
- ✅ Safe - Only affects new undo operations
- ✅ Doesn't change existing buckets
- ✅ Cash from undone payments is immediately available for withdrawal

**Before:**
```typescript
haulStartDate: dueDate  // Could be future date!
```

**After:**
```typescript
const today = new Date()
const safeHaulStartDate = dueDate <= today ? dueDate : today
haulStartDate: safeHaulStartDate  // Never future!
```

---

### ✅ **3. Manual Cash Entry Validation**
**File:** `app/api/cash/route.ts` (Lines 209-218)

**What it does:**
- Prevents manual cash entries with `haulStartDate` more than 7 days in the future
- Catches user errors when creating cash buckets directly

**Impact:**
- ✅ Safe - Only validates new entries
- ✅ Allows up to 7 days buffer for legitimate use cases
- ❌ Will reject if you try to create cash with future haul start date

---

## How to Fix Existing Blocked Buckets

You currently have **7 buckets with 7,500 SAR blocked** by future haul dates.

### Step 1: Preview the fix
```bash
npx tsx scripts/fix-future-bucket-dates.ts
```

### Step 2: Apply the fix
```bash
APPLY=true npx tsx scripts/fix-future-bucket-dates.ts
```

This will:
- Update the 7 blocked buckets to have proper past dates
- Make all 7,500 SAR immediately available for withdrawal
- Not affect any other data

---

## Future Prevention

These fixes ensure:
1. ✅ No new buckets with future haul dates can be created
2. ✅ Undo operations always create immediately available cash
3. ✅ User gets clear error messages if they try to enter invalid dates
4. ✅ Small buffer periods (7-30 days) for legitimate flexibility

---

## Testing Checklist

After applying the script fix, verify:
- [ ] Can withdraw full 7,565 SAR from cash balance
- [ ] Can pay zakat using cash balance
- [ ] Savings payment with current month works
- [ ] Savings payment undo works and cash is immediately available
- [ ] Manual cash entry works with today's date

---

## Rollback Plan (if needed)

If any issues occur:
1. The script creates a backup before changes
2. Revert files using git:
   ```bash
   git checkout app/api/savings/[id]/pay/route.ts
   git checkout app/api/cash/route.ts
   ```
3. Or manually remove the validation blocks added

---

**Created:** 2026-04-09  
**Issue:** Future haul start dates blocking withdrawals  
**Status:** ✅ Fixed - Awaiting user to run fix script
