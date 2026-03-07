# Solution: Fix Deal Creation and Closing

## Root Cause
When you create a deal, it's not properly:
1. Creating the CASH_INVEST transaction
2. Setting the principalAmount correctly

This causes the deal to have `principalAmount=0`, which then blocks withdrawal.

## Immediate Fix

### Step 1: Delete the corrupted deal
Visit your dashboard and delete "مشروع البندرية ٣"

### Step 2: Start fresh with proper workflow

1. **Log initial cash** (if not already done):
   - Go to Cash Balance card
   - Click "Log Cash"
   - Direction: IN
   - Amount: 5000
   - Submit

2. **Create the deal properly**:
   - Go to Sukuk page
   - Click "Create New Sukuk"
   - Fill in:
     - Name: مشروع البندرية ٣
     - Principal Amount: 5000
     - Start Date: 2025-01-01
     - Maturity Date: (future date)
     - Interest Rate: 10% (or whatever)
   - **IMPORTANT**: Check browser console (F12) for any errors during creation
   - Submit

3. **Verify the deal was created correctly**:
   Visit: `http://localhost:3000/api/admin/check-current-state`
   
   You should see:
   ```json
   {
     "deal": {
       "principalAmount": 5000,  // ← Must be 5000, not 0
       "receivableAmount": 500,
       "totalReceived": 0
     },
     "summary": {
       "cashIn": 1,
       "cashInvest": 1,  // ← Must be 1, not 0
       "withdrawPrincipal": 0,
       "withdrawProfit": 0
     }
   }
   ```

4. **Close the deal**:
   - Go to Sukuk page
   - Click "Close Position" on the deal
   - Select "Principal + Profit"
   - Principal: 5000
   - Profit: 500
   - Submit

5. **Verify ledger is correct**:
   Go to Cash Ledger page
   
   You should see 4 transactions:
   - CASH_IN: +5000
   - CASH_INVEST: -5000
   - WITHDRAW_PRINCIPAL: +5000
   - WITHDRAW_PROFIT: +500
   - Final balance: 5500

## If Deal Creation Still Fails

If after creating the deal you still see `principalAmount=0` and no `CASH_INVEST` transaction:

1. **Check browser console** for JavaScript errors
2. **Check server logs** for backend errors
3. **Share the error message** with me

The create route SHOULD be working based on the code, so if it's not, there's likely:
- A validation error being thrown
- A transaction rollback happening
- A frontend issue preventing the correct data from being sent

## Alternative: Manual Fix

If you can't delete and recreate, run this to fix the current deal:

```
POST http://localhost:3000/api/admin/fix-deal-transactions
```

Then manually update the deal's principalAmount in the database or via an admin endpoint.
