import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/backend/prisma';
import { errorResponse, readBody } from '@/backend/resources';
import { dayStr } from '@/backend/validate';
import { addDaysStr, todayStr } from '@/shared/utils';

export const dynamic = 'force-dynamic';

const SINGLETON_ID = 'singleton';

/** GET /api/recovery/settings — الإعداد الوحيد، أو null إن لم يُحدَّد بعد */
export async function GET() {
  try {
    const settings = await prisma.recoverySettings.findUnique({ where: { id: SINGLETON_ID } });
    return NextResponse.json(settings);
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * POST /api/recovery/settings — تحديد/تعديل تاريخ بداية الرحلة.
 * يتطلب قراءة السجلات الحالية قبل الكتابة (أي الأيام بين startDate واليوم
 * تنقصها بيانات) لذا لا يصلح كـ CRUD عام — كل شيء في معاملة واحدة، بنفس
 * نمط debts/settle وquran/srs/review. (POST لا PUT — عميل api() الموحّد
 * في الواجهة لا يدعم إلا GET/POST/PATCH/DELETE.)
 */
export async function POST(req: NextRequest) {
  try {
    const b = await readBody(req);
    const startDate = dayStr(b, 'startDate', 'تاريخ البداية');
    const today = todayStr();

    const settings = await prisma.$transaction(async (tx) => {
      const saved = await tx.recoverySettings.upsert({
        where: { id: SINGLETON_ID },
        create: { id: SINGLETON_ID, startDate },
        update: { startDate },
      });

      if (startDate <= today) {
        const existing = await tx.recoveryLog.findMany({
          where: { date: { gte: startDate, lte: today } },
          select: { date: true },
        });
        const existingDates = new Set(existing.map((r) => r.date));

        const toCreate: { date: string; status: string }[] = [];
        for (let cursor = startDate; cursor <= today; cursor = addDaysStr(cursor, 1)) {
          if (!existingDates.has(cursor)) toCreate.push({ date: cursor, status: 'clean' });
        }
        if (toCreate.length > 0) {
          await tx.recoveryLog.createMany({ data: toCreate });
        }
      }

      return saved;
    });

    return NextResponse.json(settings);
  } catch (e) {
    return errorResponse(e);
  }
}
