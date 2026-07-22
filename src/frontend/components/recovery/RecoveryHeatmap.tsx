'use client';

import { cn, fmtDate, lastNDays } from '@/shared/utils';
import GlassCard from '@/frontend/components/ui/GlassCard';
import type { RecoveryLog } from '@/shared/types';

/** ترتيب أيام الأسبوع في العمود بدءاً من السبت (يطابق بداية الأسبوع في بقية النظام) */
function weekdayIndex(day: string): number {
  const d = new Date(day + 'T00:00:00');
  return (d.getDay() + 1) % 7;
}

type DayState = 'none' | 'clean' | 'relapse';

const STATE_BG: Record<DayState, string> = {
  none: 'bg-white/[0.05]',
  clean: 'bg-emerald-500/85',
  relapse: 'bg-rose-500/85',
};

const STATE_LABEL: Record<DayState, string> = {
  none: 'بلا بيانات',
  clean: 'نظيف',
  relapse: 'انتكاسة',
};

/**
 * خريطة حرارية سنوية على طراز GitHub — لكن بحالتين لا بتدرّج شدة:
 * أخضر = يوم نظيف، أحمر = انتكاسة، رمادي = بلا بيانات (قبل بداية الرحلة
 * أو يوم لم يُسجَّل). تستقبل logs جاهزة من الصفحة الأم (محسوبة مسبقاً
 * للإحصائيات) بدل الجلب الذاتي، لتفادي طلب شبكة مكرر لنفس البيانات.
 */
export default function RecoveryHeatmap({ logs, blurred = false }: { logs: RecoveryLog[]; blurred?: boolean }) {
  const stateByDate = new Map<string, DayState>();
  for (const l of logs) stateByDate.set(l.date, l.status === 'relapse' ? 'relapse' : 'clean');

  const days = lastNDays(371); // ~53 أسبوعاً — سنة كاملة تقريباً تنتهي باليوم
  const padded: (string | null)[] = [...Array(weekdayIndex(days[0])).fill(null), ...days];
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < padded.length; i += 7) weeks.push(padded.slice(i, i + 7));

  const monthLabels = weeks.map((week, i) => {
    const firstReal = week.find((d): d is string => d !== null);
    if (!firstReal) return null;
    const prevReal = weeks[i - 1]?.find((d): d is string => d !== null);
    const curMonth = firstReal.slice(0, 7);
    if (!prevReal || prevReal.slice(0, 7) !== curMonth) {
      return new Date(firstReal + 'T00:00:00').toLocaleDateString('ar-LY', { month: 'short' });
    }
    return null;
  });

  const values = Array.from(stateByDate.values());
  const cleanCount = values.filter((s) => s === 'clean').length;
  const relapseCount = values.filter((s) => s === 'relapse').length;

  return (
    <GlassCard>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="section-title">🗓️ خريطة الرحلة السنوية</h3>
          <p className={cn('text-[11px] text-slate-500', blurred && 'blur-sm select-none')}>
            {cleanCount} يوم نظيف · {relapseCount} انتكاسة خلال آخر سنة
          </p>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-slate-600">
          <span className="flex items-center gap-1"><span className={`h-2.5 w-2.5 rounded-sm ${STATE_BG.clean}`} /> نظيف</span>
          <span className="flex items-center gap-1"><span className={`h-2.5 w-2.5 rounded-sm ${STATE_BG.relapse}`} /> انتكاسة</span>
        </div>
      </div>
      <div className={cn('overflow-x-auto pb-1 transition-all duration-200', blurred && 'blur-md select-none')}>
        <div className="inline-flex flex-col gap-1">
          <div className="flex gap-1">
            {weeks.map((_, i) => (
              <div key={i} className="w-3 shrink-0 text-[9px] text-slate-600">
                {monthLabels[i] ?? ''}
              </div>
            ))}
          </div>
          <div className="flex gap-1">
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-1">
                {week.map((d, di) => {
                  if (!d) return <div key={di} className="h-3 w-3" />;
                  const state = stateByDate.get(d) ?? 'none';
                  return (
                    <div
                      key={di}
                      title={`${fmtDate(d)} — ${STATE_LABEL[state]}`}
                      className={`h-3 w-3 rounded-sm transition ${STATE_BG[state]}`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </GlassCard>
  );
}
