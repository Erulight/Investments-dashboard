# Test Owner Isolation

This document explains how the test owner isolation feature works, allowing you to create separate OWNER accounts for testing and experimentation without affecting the main owner's data.

## Overview

The system now supports **multiple isolated OWNER accounts**. Each OWNER user has their own separate data environment, completely isolated from other owners. This is achieved through the `personId` field on the User model.

## How It Works

### Data Isolation

All OWNER users now have a `Person` entity linked to them (via `personId`). This allows complete data separation:

- **Cash Buckets**: Scoped by `personId`
- **Transactions**: Scoped by `personId`
- **Investments**: Linked through allocations and transactions scoped to `personId`
- **Zakat Data**: All buckets and movements are owner-specific
- **Settings**: Cash balance settings respect owner isolation

### Creating a Test Owner

When you create a new user with role `OWNER` through the Users management interface:

```
POST /api/users
{
  "email": "test@example.com",
  "password": "securepassword",
  "name": "Test Owner",
  "role": "OWNER",
  "permissions": {
    "sukuk": true,
    "crypto": true,
    "sip": true,
    "savings": true,
    "business-deals": true,
    "zakat": true,
    "import": true,
    "settings": true
  }
}
```

The system will automatically:
1. Create a `Person` entity for this owner
2. Link the user to that person via `personId`
3. Ensure all future data is scoped to this owner's `personId`

### What Gets Isolated

Each owner sees only their own:
- **Sukuk deals** and all related transactions
- **Savings/Circlys plans** and contributions
- **Crypto investments** and valuations
- **SIP investments**
- **Business deals**
- **Cash balance** and buckets
- **Zakat calculations** and payment history
- **Debt tracking**
- **Audit logs**

### What Is Shared

Some data remains system-wide:
- **System Settings** (e.g., display currency preference) - currently global
- **Recovery assumptions** for deal status calculations
- **User accounts** list (visible only to OWNER role users)

## Resetting Test Owner Data

⚠️ **WARNING: This action is destructive and cannot be undone!**

To completely delete all data for a test owner account:

```bash
DELETE /api/admin/reset-test-owner
Content-Type: application/json

{
  "confirmEmail": "test@example.com"
}
```

**Authentication Required**: You must be logged in as the OWNER user whose data you want to delete.

### What Gets Deleted

The reset operation removes **everything** associated with the owner's `personId`:

1. ✅ Audit logs for this user
2. ✅ Debt payments
3. ✅ Debts
4. ✅ Cash bucket movements
5. ✅ Investment bucket allocations
6. ✅ Cash buckets
7. ✅ Transactions (all types: CASH_IN, INVEST_IN, INVEST_OUT, etc.)
8. ✅ Deal participants
9. ✅ Investments (Sukuk, Savings, Crypto, SIP, Business Deals)
10. ✅ Valuations
11. ✅ Accounts linked to this owner's data
12. ✅ Person entity
13. ✅ User account itself

### Safety Measures

The reset endpoint includes safety checks:

1. **Email confirmation required**: You must provide the exact email address to proceed
2. **personId validation**: Only works for OWNER users with a `personId` (new owners)
3. **Transaction-wrapped**: All deletions happen atomically - if any step fails, nothing is deleted
4. **Authentication required**: Must be logged in as the owner being deleted
5. **Role check**: Only OWNER role can access this endpoint

### Response

On success, you'll receive a detailed breakdown:

```json
{
  "success": true,
  "deleted": {
    "auditLogs": 45,
    "debtPayments": 3,
    "debts": 2,
    "cashBucketMovements": 156,
    "investmentBucketAllocations": 78,
    "cashBuckets": 23,
    "transactions": 189,
    "dealParticipants": 12,
    "investments": 15,
    "valuations": 8,
    "accounts": 5,
    "person": "clx123abc...",
    "user": "clx456def..."
  }
}
```

## Usage Example

### Scenario: Testing Sukuk Features

1. **Create test owner**:
   - Navigate to Settings → Users
   - Click "Create User"
   - Email: `testowner@mydomain.com`
   - Role: OWNER
   - Enable all module permissions

2. **Log in as test owner**:
   - Logout from main account
   - Login with test owner credentials

3. **Experiment freely**:
   - Create Sukuk deals
   - Test maturity calculations
   - Try different scenarios
   - Debug issues without affecting main data

4. **Reset when done**:
   ```bash
   # Using browser/Postman/curl
   DELETE http://localhost:3000/api/admin/reset-test-owner
   {
     "confirmEmail": "testowner@mydomain.com"
   }
   ```

5. **Account is deleted**: You'll be logged out automatically

## Migration Notes

### Legacy Main Owner

If you have an existing main owner account created before this feature:
- It will **NOT** have a `personId` (will be `null`)
- The reset endpoint will reject it with an error
- This is intentional to protect the main owner account
- All legacy owner data remains scoped to `personId: null`

### New Test Owners

All new OWNER users created after this feature:
- **WILL** have a `personId`
- Are fully isolated from the main owner
- Are fully isolated from each other
- Can be safely reset/deleted

## Technical Details

### Database Schema

```prisma
model User {
  id       String   @id @default(cuid())
  email    String   @unique
  role     String   @default("VIEWER")
  personId String?  @unique  // Links to Person for isolation
  person   Person?  @relation(fields: [personId], references: [id])
}

model Person {
  id               String            @id @default(cuid())
  cashBuckets      CashBucket[]      // Owner's cash buckets
  dealParticipants DealParticipant[] // Owner's investment participations
  transactions     Transaction[]     // Owner's transactions
  user             User?
}
```

### Key API Changes

All these routes now respect owner `personId` isolation:
- `GET/POST /api/cash` - Cash ledger
- `POST /api/zakat` - Zakat payments
- `GET/PUT /api/settings/cash` - Cash balance settings
- `GET /api/users` - User list (OWNER only)
- `POST /api/users` - User creation
- `DELETE /api/admin/reset-test-owner` - **NEW**: Test owner reset

## Best Practices

1. **Use descriptive emails**: Name test owners clearly (e.g., `test-sukuk-maturity@domain.com`)
2. **Reset frequently**: Don't accumulate test data - reset after each experiment
3. **Document experiments**: Keep notes on what you're testing
4. **Never share credentials**: Each tester should have their own test owner
5. **Main owner protection**: Never create a test account with production email addresses

## Troubleshooting

### "This owner account has no person profile"
- This is a legacy main owner account
- Cannot be reset (by design)
- Only affects new OWNER accounts created after this feature

### "Email confirmation does not match"
- Double-check the email spelling
- Ensure you're logged in as the correct user

### Reset takes too long
- Large datasets may take 10-30 seconds
- The transaction is atomic - either all data is deleted or none
- Check server logs for progress

### Some data still appears after reset
- SystemSettings are global and not deleted
- Shared accounts or investments from other owners remain
- This is expected behavior
