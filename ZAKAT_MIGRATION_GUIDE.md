# Zakat System Migration Guide

This guide explains how to migrate the database and activate the new rule-based Zakat calculation system.

## Overview

The new Zakat system implements 16 comprehensive Islamic finance rules for accurate Zakat calculation on Sukuk investments. The system has been built but requires database migration to be fully functional.

## Database Migration Steps

### 1. Generate Prisma Client
```bash
npx prisma generate
```

### 2. Create and Apply Migration
```bash
npx prisma migrate dev --name add-zakat-payment-model
```

### 3. Verify Migration
Check that the `ZakatPayment` table has been created with the following structure:
- `id` (String, Primary Key)
- `investmentId` (String, Foreign Key to Investment)
- `userId` (String, Foreign Key to User)
- `personId` (String, Optional, Foreign Key to Person)
- `amount` (Float)
- `date` (DateTime)
- `notes` (String, Optional)
- `paymentMethod` (String, Default: "MANUAL")
- `status` (String, Default: "COMPLETED")
- `createdAt` (DateTime)
- `updatedAt` (DateTime)

## Post-Migration Activation

### 1. Update Zakat Page
In `app/(dashboard)/zakat/page.tsx`, uncomment the zakatPayments relation:

```typescript
// Change this:
// TODO: Uncomment after running prisma generate and migrate
// zakatPayments: {
//   orderBy: { date: 'desc' },
//   take: 1
// }

// To this:
zakatPayments: {
  orderBy: { date: 'desc' },
  take: 1
}
```

Also update the lastPayment logic:
```typescript
// Change this:
// TODO: Uncomment after running prisma generate and migrate
// const lastPayment = investment.zakatPayments?.[0]
const lastPayment = null // Temporary until schema is migrated

// To this:
const lastPayment = investment.zakatPayments?.[0]
```

### 2. Update API Endpoint
In `app/api/zakat/investment/route.ts`, uncomment the ZakatPayment creation:

```typescript
// Uncomment the zakatPayment.create() call and related code
// Remove the temporary payment ID logic
```

## 16 Zakat Rules Implemented

### Core Rules
1. **Sukuk Type Gate**: Ijarah → Zakat = 0, Murabaha → proceed
2. **Duration Gate**: Investment period < 354 days → Zakat = 0
3. **Zakat Rate**: Always 2.5% on distributed cash amount

### Hawl (Year) Calculation Rules
4. **Hawl Start Date**: From earlier of funds ownership or investment date
5. **Hawl Calendar**: Hijri lunar calendar (354 days = 1 year)
6. **Zakat Trigger**: Only on actual cash receipt, not paper amounts

### Distribution Rules
7. **Pre-Zakat-Date Distributions**: Add to wealth pool, apply Zakat if held on Zakat date
8. **Post-Zakat-Date Distributions**: Apply Zakat immediately if hawl passed
9. **Spent Distributions**: If spent before Zakat date → Zakat = 0
10. **Future Unpaid Distributions**: Never calculate on amounts not yet received

### Edge Case Rules
11. **Early Settlement**: If redeemed before 1 year → Zakat = 0
12. **Late/Delayed Payment**: If delayed beyond 1 year by issuer → Zakat = 0
13. **Default/Liquidation**: If company defaults with multi-year delay → Zakat = 0
14. **Rolling Short-Term**: Hawl starts from ORIGINAL funds ownership date

### Data Model Rules
15. **Required Fields**: All investment records store required fields per Rule 15
16. **Zakat Base**: Always gross amounts, no deductions allowed

## Features

### Dashboard Features
- **Rule Explanation**: Shows which rules were applied to each calculation
- **Investment Tracking**: Displays all Sukuk investments with Zakat status
- **Hijri Calendar**: Shows both Gregorian and Hijri dates for hawl calculations
- **Status Indicators**: Clear status for each investment (Exempt, Pending, Due, Paid)
- **Filtering**: Filter by status, Sukuk type, and other criteria
- **Payment Tracking**: Record and track Zakat payments

### Calculation Engine Features
- **Comprehensive Rule Engine**: Implements all 16 rules accurately
- **Hijri Calendar Support**: Proper 354-day lunar year calculations
- **Distribution Tracking**: Tracks all cash receipts and their Zakat implications
- **Edge Case Handling**: Handles early settlement, defaults, rolling investments
- **Audit Trail**: Full audit trail of calculations and payments

## Testing Scenarios

After migration, test these scenarios:

### 1. Basic Murabaha Sukuk
- Investment: SAR 100,000 Murabaha, held > 354 days
- Distributions: SAR 5,000 received after hawl completion
- Expected Zakat: SAR 125 (2.5% of SAR 5,000)

### 2. Ijarah Sukuk (Should be Exempt)
- Investment: SAR 50,000 Ijarah, any duration
- Expected Zakat: SAR 0 (Rule 1: Ijarah exempt)

### 3. Short-Term Investment
- Investment: SAR 75,000 Murabaha, held < 354 days
- Expected Zakat: SAR 0 (Rule 2: Duration gate)

### 4. Early Settlement
- Investment: SAR 200,000 Murabaha, redeemed after 300 days
- Expected Zakat: SAR 0 (Rule 11: Early settlement)

### 5. Rolling Short-Term
- Series: 3x 4-month Murabaha investments, same funds
- Hawl should start from original funds ownership date
- Zakat applies if total period > 354 days

## Troubleshooting

### Common Issues

1. **Prisma Client Not Updated**
   - Run `npx prisma generate` again
   - Restart your development server

2. **Migration Fails**
   - Check database connection
   - Ensure no conflicting table names
   - Review migration SQL for issues

3. **TypeScript Errors**
   - Ensure all TODO comments are addressed
   - Check that zakatPayments relations are properly uncommented

4. **Calculation Discrepancies**
   - Verify investment dates are correct
   - Check that distributions are properly recorded
   - Ensure Sukuk type is correctly set (isIjarah field)

## Support

For issues with the Zakat calculation system:
1. Check the calculation breakdown in the dashboard
2. Review the rules applied section
3. Verify input data matches the 16 rules requirements
4. Check console logs for detailed calculation steps

The system provides detailed explanations for each calculation, making it easy to understand why specific amounts were calculated.
