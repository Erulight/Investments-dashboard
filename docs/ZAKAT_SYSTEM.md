# Rule-Based Zakat Calculation System

## Overview

This system implements a comprehensive, rule-based Zakat calculation engine for Sukuk investments, following 16 specific Islamic finance rules. The system ensures accurate, compliant, and auditable Zakat calculations.

## Architecture

### Core Components

1. **Zakat Calculation Engine** (`lib/zakat.ts`)
   - Implements all 16 Zakat rules
   - Handles Hijri calendar calculations
   - Processes investment records and distributions
   - Returns detailed calculation breakdowns

2. **Rule-Based Dashboard** (`components/zakat/RuleBasedZakatDashboard.tsx`)
   - Modern UI for viewing Zakat calculations
   - Shows rule explanations and breakdowns
   - Supports filtering and sorting
   - Handles payment processing

3. **Zakat Page** (`app/(dashboard)/zakat/page.tsx`)
   - Server-side data fetching
   - Investment record processing
   - Integration with calculation engine

4. **Payment API** (`app/api/zakat/investment/route.ts`)
   - Handles Zakat payment recording
   - Creates audit trail transactions
   - Supports payment history retrieval

## The 16 Zakat Rules

### Core Rules (1-3)
**Rule 1 — Sukuk Type Gate**
- Ijarah Sukuk: Zakat = 0 (exempt)
- Murabaha Sukuk: Proceed with calculation
- Implementation: `applySukukTypeGate()`

**Rule 2 — Duration Gate**
- Investment period < 354 days (1 Hijri year): Zakat = 0
- Implementation: `applyDurationGate()`

**Rule 3 — Zakat Rate**
- Always 2.5% on distributed cash amounts
- No deductions allowed (gross calculation)
- Implementation: `calculateZakatAmount()`

### Hawl (Year) Calculation Rules (4-6)
**Rule 4 — Hawl Start Date**
- Starts from EARLIER of: funds ownership date OR investment date
- Implementation: `calculateHawlStartDate()`

**Rule 5 — Hawl Calendar**
- Uses Hijri lunar calendar (354 days = 1 year exactly)
- Implementation: `addHijriDays()`, `diffHijriDays()`, `hasCompletedHijriYear()`

**Rule 6 — Zakat Trigger**
- Only triggered on actual cash receipt
- Not on paper/accrued amounts
- Implementation: `getDistributionsSubjectToZakat()`

### Distribution Rules (7-10)
**Rule 7 — Pre-Zakat-Date Distributions**
- Received before annual Zakat date
- Add to total wealth pool
- Apply Zakat only if still held on Zakat date

**Rule 8 — Post-Zakat-Date Distributions**
- Received after annual Zakat date
- Apply Zakat immediately upon receipt (if hawl completed)

**Rule 9 — Spent Distributions**
- If spent before Zakat date: Zakat = 0
- Implementation: `is_spent_before_zakat_date` flag

**Rule 10 — Future Unpaid Distributions**
- Never calculate on amounts not yet received
- Even if contractually due

### Edge Case Rules (11-14)
**Rule 11 — Early Settlement**
- If redeemed before 1 full year: Zakat = 0
- Implementation: `applyEarlySettlementRule()`

**Rule 12 — Late/Delayed Payment**
- If payment delayed beyond 1 year by issuer: Zakat = 0

**Rule 13 — Default/Liquidation**
- If company defaults with multi-year delay: Zakat = 0
- Implementation: `applyDefaultRule()`

**Rule 14 — Rolling Short-Term Investments**
- For repeatedly rolled short-term sukuk
- Hawl starts from ORIGINAL funds ownership date
- Implementation: `adjustForRollingInvestments()`

### Data Model Rules (15-16)
**Rule 15 — Required Fields**
Every investment record must store:
- `sukuk_type`
- `funds_ownership_date`
- `investment_date`
- `user_zakat_annual_date`
- `distributions[]` with `receipt_date` and `amount`
- `redemption_date`, `redemption_amount`
- `is_defaulted`

**Rule 16 — Zakat Base is Gross**
- Never subtract fees, taxes, or costs
- Input amounts must be net as received
- No deductions in calculation

## Data Flow

### 1. Investment Data Collection
```typescript
// Fetch Sukuk investments from database
const investments = await prisma.investment.findMany({
  where: { account: { type: 'SUKUK' } },
  include: { transactions: true, dealParticipants: true }
})
```

### 2. Record Conversion
```typescript
// Convert to InvestmentRecord format
const investmentRecords = investments.map(inv => 
  createInvestmentRecord(inv, userZakatAnnualDate)
)
```

### 3. Rolling Investment Adjustment
```typescript
// Apply Rule 14: Rolling short-term adjustments
const adjustedRecords = adjustForRollingInvestments(investmentRecords)
```

### 4. Zakat Calculation
```typescript
// Calculate Zakat using all 16 rules
const calculationResult = calculateZakat(adjustedRecords, currentDate)
```

### 5. Dashboard Display
```typescript
// Convert to dashboard format and display
const investmentRows = calculationResult.breakdown.map(breakdown => ({
  // ... dashboard row data
}))
```

## API Endpoints

### POST `/api/zakat/investment`
Records a Zakat payment for an investment.

**Request:**
```json
{
  "investmentId": "string",
  "amount": number,
  "date": "YYYY-MM-DD",
  "notes": "string (optional)"
}
```

**Response:**
```json
{
  "success": true,
  "payment": {
    "id": "string",
    "amount": number,
    "date": "YYYY-MM-DD",
    "investmentName": "string"
  }
}
```

### GET `/api/zakat/investment`
Retrieves Zakat payment history.

**Response:**
```json
{
  "payments": [
    {
      "id": "string",
      "investmentId": "string",
      "investmentName": "string",
      "amount": number,
      "date": "YYYY-MM-DD",
      "notes": "string",
      "status": "string",
      "createdAt": "ISO string"
    }
  ]
}
```

## Database Schema

### ZakatPayment Model
```prisma
model ZakatPayment {
  id            String     @id @default(cuid())
  investmentId  String
  userId        String
  personId      String?
  amount        Float
  date          DateTime
  notes         String?
  paymentMethod String     @default("MANUAL")
  status        String     @default("COMPLETED")
  createdAt     DateTime   @default(now())
  updatedAt     DateTime   @updatedAt
  investment    Investment @relation(fields: [investmentId], references: [id])
  user          User       @relation(fields: [userId], references: [id])
  person        Person?    @relation(fields: [personId], references: [id])

  @@index([investmentId])
  @@index([userId])
  @@index([personId])
  @@index([date])
}
```

## UI Components

### RuleBasedZakatDashboard
Main dashboard component with:
- **Summary Cards**: Total Zakat due, investment count, exempt count
- **Rules Explanation**: Shows which rules were applied
- **Investment Table**: Sortable, filterable table of investments
- **Status Badges**: Visual indicators for investment status
- **Payment Modal**: Interface for recording payments
- **Details Modal**: Detailed view of investment calculations

### Key Features
- **Hijri Date Display**: Shows both Gregorian and Hijri dates
- **Rule Explanations**: Detailed breakdown of why each calculation was made
- **Status Filtering**: Filter by Exempt, Pending, Due, Paid
- **Sukuk Type Filtering**: Filter by Murabaha vs Ijarah
- **Sorting**: Sort by any column (amount, days held, etc.)

## Testing

### Test Scenarios

1. **Basic Murabaha Test**
   ```typescript
   const record = {
     sukuk_type: 'MURABAHA',
     principal_amount: 100000,
     days_held: 400, // > 354 days
     distributions: [{ amount: 5000, receipt_date: afterHawl }]
   }
   // Expected: 125 SAR (2.5% of 5000)
   ```

2. **Ijarah Exemption Test**
   ```typescript
   const record = {
     sukuk_type: 'IJARAH',
     principal_amount: 50000,
     days_held: 400
   }
   // Expected: 0 SAR (Rule 1: Ijarah exempt)
   ```

3. **Duration Gate Test**
   ```typescript
   const record = {
     sukuk_type: 'MURABAHA',
     principal_amount: 75000,
     days_held: 300 // < 354 days
   }
   // Expected: 0 SAR (Rule 2: Duration gate)
   ```

## Error Handling

### Calculation Errors
- Invalid dates: Gracefully handle with default values
- Missing data: Skip calculations with clear error messages
- Type mismatches: Convert with validation

### API Errors
- Authentication: 401 Unauthorized
- Authorization: 403 Forbidden
- Validation: 400 Bad Request with details
- Not Found: 404 for invalid investment IDs
- Server: 500 Internal Server Error

### UI Error States
- Loading states during calculations
- Error messages for failed operations
- Fallback displays for missing data
- Validation feedback for user inputs

## Performance Considerations

### Calculation Optimization
- Batch processing of multiple investments
- Efficient date calculations using timestamps
- Memoization of repeated calculations
- Lazy loading of detailed breakdowns

### Database Optimization
- Indexed queries on investment and transaction tables
- Selective field loading with Prisma includes
- Pagination for large result sets
- Connection pooling for concurrent requests

### UI Performance
- Virtual scrolling for large investment lists
- Debounced search and filtering
- Optimistic updates for payment recording
- Cached calculation results

## Security

### Access Control
- Role-based access (OWNER, PARTNER)
- User-specific data filtering
- Investment ownership validation
- Audit trail for all operations

### Data Validation
- Zod schemas for API inputs
- Type safety with TypeScript
- Sanitized database queries
- Input validation on all forms

### Audit Trail
- All Zakat payments recorded in transactions
- Calculation metadata stored with results
- User actions logged in audit system
- Immutable calculation history

## Maintenance

### Regular Tasks
- Monitor calculation accuracy
- Review rule implementations
- Update Hijri calendar calculations
- Backup payment records

### Updates
- Rule changes require code updates
- Database migrations for schema changes
- API versioning for breaking changes
- Documentation updates for new features

### Monitoring
- Track calculation performance
- Monitor API response times
- Alert on calculation errors
- Dashboard usage analytics
