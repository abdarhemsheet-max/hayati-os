import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/backend/prisma';
import { errorResponse, readBody } from '@/backend/resources';
import { ValidationError, reqStr, posNum } from '@/backend/validate';

export const dynamic = 'force-dynamic';

/**
 * POST /api/subscriptions/[id]/pay — دفع اشتراك من محفظة محددة.
 * معاملة واحدة: خصم من المحفظة + حركة مصروف موثقة + ترحيل تاريخ التجديد
 * للدورة القادمة (شهر أو سنة).
 * amount اختياري: إن مرِّر بقيمة مختلفة عن السعر المخزّن (تغيّر السعر) يُدفع
 * بالقيمة الجديدة ويُحدَّث سعر الاشتراك المخزّن ليعكس السعر الحالي.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const b = await readBody(req);
    const walletId = reqStr(b, 'walletId', 'المحفظة', 100);

    const result = await prisma.$transaction(async (tx) => {
      const sub = await tx.subscription.findUnique({ where: { id: params.id } });
      if (!sub) throw new ValidationError('الاشتراك غير موجود — أعد تحميل الصفحة');
      if (!sub.isActive) throw new ValidationError('هذا الاشتراك موقوف');

      // المبلغ المدفوع فعلياً هذه المرة (قد يختلف عن المخزّن عند تغيّر السعر)
      const pay = b.amount === undefined || b.amount === null || b.amount === ''
        ? sub.amount
        : posNum(b, 'amount', 'المبلغ المدفوع');
      if (pay <= 0) throw new ValidationError('قيمة الاشتراك غير صالحة');

      const wallet = await tx.wallet.findUnique({ where: { id: walletId } });
      if (!wallet) throw new ValidationError('المحفظة غير موجودة');
      if (wallet.balance < pay) {
        throw new ValidationError(`رصيد «${wallet.name}» غير كافٍ لدفع ${pay}`);
      }

      await tx.transaction.create({
        data: {
          type: 'expense',
          status: 'completed',
          amount: pay,
          category: 'اشتراكات',
          description: `دفع اشتراك ${sub.name}`,
          walletId: wallet.id,
        },
      });

      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { increment: -pay } },
      });

      // ترحيل التجديد للدورة القادمة
      const next = new Date(sub.nextRenewal);
      if (sub.billingCycle === 'monthly') next.setMonth(next.getMonth() + 1);
      else next.setFullYear(next.getFullYear() + 1);

      return tx.subscription.update({
        where: { id: sub.id },
        // حفظ السعر الجديد إن تغيّر + تذكّر آخر محفظة دفع كافتراضية للمرة القادمة
        data: { nextRenewal: next, amount: pay, defaultWalletId: wallet.id },
      });
    });

    return NextResponse.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
