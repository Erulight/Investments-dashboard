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
    
    // Try to extract year from row key
    const notes = payment.notes || ''
    const rowKeyMatch = notes.match(/ZAKAT_ROW=(.+)/)
    
    if (rowKeyMatch) {
      const rowKey = rowKeyMatch[1]
      console.log(`  Row Key: ${rowKey}`)
      
      const parts = rowKey.split('|')
      const dates = parts.filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p))
      
      console.log(`  Date parts found: ${dates.join(', ')}`)
      
      if (dates.length > 0) {
        const haulEndDate = dates[dates.length - 1]
        const yearMatch = haulEndDate.match(/^(\d{4})-/)
        if (yearMatch) {
          console.log(`  Extracted Year: ${yearMatch[1]}`)
        }
      } else {
        console.log(`  No dates found in row key - will use payment date year: ${payment.date.getFullYear()}`)
      }
    } else {
      console.log(`  No ZAKAT_ROW marker found`)
    }
    
    console.log('')
  })

  await prisma.$disconnect()
}

checkPayments().catch(console.error)
