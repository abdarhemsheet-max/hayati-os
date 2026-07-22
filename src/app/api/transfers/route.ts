import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/backend/prisma';
import { errorResponse, readBody } from '@/backend/resources';
import { ValidationError, reqStr, posNum, optStr, optDate } from '@/backend/validate';

export const dynamic = 'force-dynamic';

/**
 * POST /api/transfers — تحويل مبلغ بين محفظتين.
 * لا يُحتسب دخلاً ولا مصروفاً: يُخصم من المصدر ويُضاف للوجهة فقط، وتُسجَّل
 * حركة واحدة type=transfer (walletId=المصدر، toWalletId=الوجهة) للأرشفة.
 * كل ذلك في معاملة واحدة ($transaction) — تنجح كاملة أو تفشل كاملة.
 */
export async function POST(req: NextRequest) {
  try {
    const b = await readBody(req);
    const fromWalletId = reqStr(b, 'fromWalletId', 'المحفظة المصدر', 100);
    const toWalletId = reqStr(b, 'toWalletId', 'المحفظة الوجهة', 100);
    const amount = posNum(b, 'amount', 'المبلغ');
    if (fromWalletId === toWalletId) {
      throw new ValidationError('لا يمكن التحويل إلى نفس المحفظة');
    }

    const txn = await prisma.$transaction(async (tx) => {
      const from = await tx.wallet.findUnique({ where: { id: fromWalletId } });
      if (!from) throw new ValidationError('المحفظة المصدر غير موجودة');
      const to = await tx.wallet.findUnique({ where: { id: toWalletId } });
      if (!to) throw new ValidationError('المحفظة الوجهة غير موجودة');
      if (from.balance < amount) {
        throw new ValidationError(`رصيد «${from.name}» غير كافٍ لهذا التحويل`);
      }

      const created = await tx.transaction.create({
        data: {
          type: 'transfer',
          status: 'completed',
          amount,
          category: 'تحويل',
          description: optStr(b, 'description') ?? `تحويل من ${from.name} إلى ${to.name}`,
          date: optDate(b, 'date') ?? new Date(),
          walletId: from.id,
          toWalletId: to.id,
        },
      });

      await tx.wallet.update({ where: { id: from.id }, data: { balance: { increment: -amount } } });
      await tx.wallet.update({ where: { id: to.id }, data: { balance: { increment: amount } } });

      return created;
    });

    return NextResponse.json(txn, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
