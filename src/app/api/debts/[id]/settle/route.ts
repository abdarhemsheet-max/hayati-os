import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/backend/prisma';
import { errorResponse, readBody } from '@/backend/resources';
import { ValidationError, reqStr, posNum } from '@/backend/validate';

export const dynamic = 'force-dynamic';

/**
 * POST /api/debts/[id]/settle — تسديد دين (كامل أو جزئي) عبر محفظة محددة.
 * المركزية المالية: كل قرش يمر عبر محفظة —
 *  - دين «لي عنده» (owed_to_me): تحصيل → يُضاف المبلغ للمحفظة + حركة دخل
 *  - دين «عليّ له» (i_owe): سداد → يُخصم من المحفظة + حركة مصروف
 * السداد الجزئي: amount اختياري (افتراضياً المتبقي كاملاً)؛ paidAmount يتراكم
 * وisSettled لا يصبح true إلا عند اكتمال المبلغ الأصلي. القيمة الأصلية والمسدد
 * يبقيان محفوظين دائماً (لا تصفير) للأرشيف المالي.
 * كل ذلك في معاملة واحدة ($transaction) — تنجح كاملة أو تفشل كاملة.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const b = await readBody(req);
    const walletId = reqStr(b, 'walletId', 'المحفظة', 100);

    const result = await prisma.$transaction(async (tx) => {
      const debt = await tx.debt.findUnique({ where: { id: params.id } });
      if (!debt) throw new ValidationError('الدين غير موجود — أعد تحميل الصفحة');
      if (debt.isSettled) throw new ValidationError('هذا الدين مسدد بالفعل');

      const remaining = debt.amount - debt.paidAmount;
      if (remaining <= 0) throw new ValidationError('لا يوجد مبلغ متبقٍ على هذا الدين');

      // المبلغ المدفوع الآن: افتراضياً المتبقي كاملاً، أو مبلغاً جزئياً محدداً
      const pay = b.amount === undefined || b.amount === null || b.amount === ''
        ? remaining
        : posNum(b, 'amount', 'مبلغ السداد');
      if (pay > remaining + 1e-9) {
        throw new ValidationError(`المبلغ يتجاوز المتبقي (${remaining})`);
      }

      const wallet = await tx.wallet.findUnique({ where: { id: walletId } });
      if (!wallet) throw new ValidationError('المحفظة غير موجودة');

      const isCollecting = debt.direction === 'owed_to_me';
      if (!isCollecting && wallet.balance < pay) {
        throw new ValidationError(`رصيد «${wallet.name}» غير كافٍ لسداد ${pay}`);
      }

      // حركة مالية موثقة مرتبطة بالمحفظة
      await tx.transaction.create({
        data: {
          type: isCollecting ? 'income' : 'expense',
          status: 'completed',
          amount: pay,
          category: isCollecting ? 'تحصيل دين' : 'سداد دين',
          description: `${isCollecting ? 'تحصيل دين من' : 'سداد دين إلى'} ${debt.personName}`,
          walletId: wallet.id,
        },
      });

      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { increment: isCollecting ? pay : -pay } },
      });

      const newPaid = debt.paidAmount + pay;
      return tx.debt.update({
        where: { id: debt.id },
        data: { paidAmount: newPaid, isSettled: newPaid >= debt.amount - 1e-9 },
      });
    });

    return NextResponse.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
