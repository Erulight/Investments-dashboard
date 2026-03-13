# Zakat Audit Fix System

## Overview
Interactive system for reviewing and fixing Zakat audit warnings with detailed explanations, real data examples, and automated fixes.

## Features

### 1. **Real Data Examples**
Each warning now displays YOUR actual data:
- **MISSING_HAUL_START**: Shows bucket name, balance, and missing hawl date
- **DEBT_BUCKET_LEAKING**: Shows bucket name, debt amount, current balance
- **DOUBLE_COUNTING**: Lists all investments sharing the same bucket with amounts
- **MISSING_SAVINGS_HAUL**: Shows investment name and ROSCA bucket sources

### 2. **Multiple Fix Options**
Warnings display solution strategies:
- **Auto-fixable**: Green "🛠️ Fix" button for automated resolution
- **Manual review**: Amber warning explaining what you need to decide
- **Manual input**: Blue info box explaining required user input

### 3. **Auto-Fixable Warnings**

#### DEBT_BUCKET_LEAKING
**Problem**: Borrowed money bucket included in zakat  
**Fix**: Sets `excludeFromZakat = true` for the debt bucket  
**Example**:
```
Bucket: "Car Loan Payment"
Debt Amount: 50,000 SAR
Fix: Mark as excluded from zakat
```

#### MISSING_SAVINGS_HAUL
**Problem**: ROSCA-funded Sukuk missing hawl continuity anchor  
**Fix**: Auto-syncs `savingsHaulStartDate` from ROSCA bucket  
**Example**:
```
Investment: "Sedco Sukuk B2B"
ROSCA Buckets: "Circlys Reward Receipt • Jan 2024"
Fix: Set savingsHaulStartDate from reward receipt anchor
```

### 4. **Manual Review Warnings**

#### DOUBLE_COUNTING
**Problem**: One bucket allocated to multiple active investments  
**Requires**: Manual decision on which allocation is correct  
**Options**:
1. Split bucket into separate buckets for each investment
2. Close one allocation (mark investment as fully withdrawn)

#### MISSING_HAUL_START
**Problem**: Cash bucket missing hawl start date  
**Requires**: User must provide the date  
**Options**:
1. Use earliest transaction date
2. Use first contribution date  
3. Set manually in Cash Buckets page

## How to Use

### Step 1: View Warnings
1. Navigate to **Zakat Audit** page
2. Click **Warnings** tab
3. Warnings are grouped by type

### Step 2: Review Details
1. Click **"Review"** button on any warning
2. Read the **Explanation** (why this is a problem)
3. See **YOUR DATA** section with real values
4. Read **Solution Steps** (how to fix it)

### Step 3: Apply Fixes
For auto-fixable warnings:
1. Click **"🛠️ Fix"** button
2. Review the fix options displayed
3. Click the green **"✅ Option"** button
4. Wait for success toast notification
5. Page reloads automatically

### Step 4: Undo if Needed
1. Click **"🛠️ Fixes"** tab at the top
2. See all applied fixes
3. Click **"↩️ Undo"** on any fix
4. Confirm - page reloads with warning restored

## Technical Details

### Database Changes
New table: `ZakatFixHistory`
- Tracks all fix attempts
- Stores old/new state for undo
- Records timestamps and user

### API Endpoints
- `POST /api/zakat/fix` - Apply a fix
- `DELETE /api/zakat/fix?fixId=X` - Undo a fix

### Fix Actions
1. `exclude-from-zakat` - Mark debt bucket as excluded
2. `sync-rosca-haul` - Sync ROSCA hawl to Sukuk investment

## Warnings Status

| Warning Type | Auto-Fixable | Requires Manual Review |
|--------------|--------------|------------------------|
| DEBT_BUCKET_LEAKING | ✅ Yes | ❌ No |
| MISSING_SAVINGS_HAUL | ✅ Yes | ❌ No |
| DOUBLE_COUNTING | ❌ No | ✅ Yes |
| MISSING_HAUL_START | ❌ No | ✅ Yes (needs date input) |

## Example Workflow

### Scenario: Debt Bucket Warning
```
Warning: "Debt bucket leaking into zakat — Car Loan"

📊 YOUR DATA:
• Bucket: Car Loan Payment
• Debt Amount: 50,000 SAR
• Current Balance: 15,000 SAR
• Exclude from Zakat: NOT SET ⚠️

🛠️ AUTO-FIX OPTIONS:
✅ Option 1: Mark bucket as "Exclude from Zakat"
   Sets excludeFromZakat=true for this debt bucket

[Click "✅ Option 1"]
→ Success! ✅ Successfully excluded "Car Loan Payment" from zakat calculations
→ Page reloads, warning disappears
```

### Scenario: Double Counting (Manual)
```
Warning: "Possible double counting — General Savings"

📊 YOUR DATA:
• Bucket: General Savings
• Balance: 25,000 SAR
⚠️ Allocated to 2 investments:
  → Sedco Sukuk: 15,000 SAR
  → B2B Deal: 10,000 SAR

⚠️ This requires manual review
You need to decide which allocation is correct:
• Sedco Sukuk (15,000 SAR)
• B2B Deal (10,000 SAR)
→ Go to Cash Buckets page to split or close allocations
```

## Benefits

1. **Transparency**: See exactly what's wrong with your data
2. **Safety**: Undo any automated fix if needed
3. **Audit Trail**: All fixes are logged with timestamps
4. **Education**: Learn why each issue matters for Zakat
5. **Efficiency**: Fix issues with one click where possible

## Future Enhancements
- Add more auto-fixable warning types
- Bulk fix multiple warnings at once
- Export fix history report
- Email notifications for critical warnings
