# Cash Ledger Diagnostic Steps

## 1. Verify server is running
Make sure your Next.js dev server is running on http://localhost:3000

## 2. Test the API endpoint directly
Open your browser and navigate to:
```
http://localhost:3000/api/admin/test-ledger
```

This should return JSON showing all 4 transactions.

## 3. Test the actual ledger API
Navigate to:
```
http://localhost:3000/api/cash/ledger
```

This should return the same transactions in the format the UI expects.

## 4. Check the Cash Ledger page
Navigate to:
```
http://localhost:3000/cash-ledger
```

## 5. Check browser console
Open browser DevTools (F12) and check:
- Console tab for any JavaScript errors
- Network tab to see if the API call to `/api/cash/ledger` is being made
- What response the API returns

## Expected API Response Format
```json
{
  "cashBalance": 5600,
  "transactions": [
    {"id": "...", "type": "WITHDRAW_PROFIT", "amount": 600, "date": "2026-03-07T00:00:00.000Z", ...},
    {"id": "...", "type": "WITHDRAW_PRINCIPAL", "amount": 5000, "date": "2026-03-07T00:00:00.000Z", ...},
    {"id": "...", "type": "CASH_INVEST", "amount": -5000, "date": "2025-01-01T00:00:00.000Z", ...},
    {"id": "...", "type": "CASH_IN", "amount": 5000, "date": "2025-01-01T00:00:00.000Z", ...}
  ],
  "totalCount": 4,
  "page": 1,
  "limit": 50,
  "totalPages": 1,
  "buckets": [],
  "transactionTypes": ["CASH_IN", "CASH_INVEST", "WITHDRAW_PRINCIPAL", "WITHDRAW_PROFIT"],
  "userRole": "OWNER"
}
```

## Common Issues

### Issue 1: Server not running
**Solution**: Run `npm run dev` in the project directory

### Issue 2: Authentication error
**Solution**: Make sure you're logged in as OWNER

### Issue 3: Page shows "Loading..." forever
**Cause**: API request is failing
**Solution**: Check browser console and Network tab for errors

### Issue 4: Page shows "No transactions found"
**Cause**: API returns empty transactions array
**Solution**: Check the API response directly in browser

### Issue 5: Transactions exist but don't display
**Cause**: Frontend rendering issue
**Solution**: Hard refresh the page (Ctrl+Shift+R) or clear browser cache

## What to report back
Please share:
1. What you see when you visit `/api/admin/test-ledger`
2. What you see when you visit `/api/cash/ledger`
3. What you see on the `/cash-ledger` page
4. Any errors in the browser console
