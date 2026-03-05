const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    const cashAccount = await prisma.account.findFirst({
      where: { type: 'CASH' }
    });

    const txs = await prisma.transaction.findMany({
      where: { accountId: cashAccount?.id },
      orderBy: { date: 'desc' },
      take: 20,
      select: { type: true, amount: true, date: true, description: true, createdAt: true }
    });

    console.log('Recent cash transactions:');
    txs.forEach(t => console.log(`${t.date ? new Date(t.date).toISOString().split('T')[0] : '—'} | ${t.type} | ${t.amount} | ${t.description || ''}`));

    const setting = await prisma.systemSetting.findUnique({ where: { key: 'CASH_BALANCE' }});
    console.log('SystemSetting CASH_BALANCE:', setting?.value);

    const txSum = await prisma.transaction.aggregate({
      where: { accountId: cashAccount?.id },
      _sum: { amount: true }
    });
    console.log('Sum of all cash transactions:', txSum._sum.amount);
  } catch (e) {
    console.error('CASH DIAGNOSTICS ERROR:', e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
