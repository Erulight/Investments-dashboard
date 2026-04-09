import 'dotenv/config'
import { prisma } from '../lib/db'

async function checkPayments() {
  console.log('🔍 Checking Zakat Payment Notes...\n')

  const payments = await prisma.cashBucketMovement.findMany({
    where: {
      type: 'ZAKAT_PAID',
    },
    select: {
      id: true,
      amount: true,
      date: true,
      notes: true,
      cashBucketId: true,
    },
    orderBy: {
      date: 'desc',
    },
  })

  console.log(`Found ${payments.length} zakat payment(s)\n`)

  payments.forEach((payment, idx) => {
    console.log(`Payment ${idx + 1}:`)
    console.log(`  Amount: ${Math.abs(payment.amount)} SAR`)
    console.log(`  Date: ${payment.date.toISOString().split('T')[0]}`)
    console.log(`  Notes: ${payment.notes || '(no notes)'}`)
    
    // Try to extract row key (new logic with non-greedy match)
    const notes = payment.notes || ''
    const rowKeyMatch = notes.match(/ZAKAT_ROW=(.+?)(?:\s|$)/)
    
    if (rowKeyMatch) {
      const rowKey = rowKeyMatch[1]
      console.log(`  Row Key: ${rowKey}`)
      console.log(`  → This will be looked up in the row year map`)
      console.log(`  → If not found, will fallback to payment year: ${payment.date.getFullYear()}`)
    } else {
      console.log(`  No ZAKAT_ROW marker found - will use payment year: ${payment.date.getFullYear()}`)
    }
    
    console.log('')
  })

  await prisma.$disconnect()
}

checkPayments().catch(console.error)
