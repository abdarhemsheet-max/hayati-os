'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  HeartPulse,
  Pencil,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Trophy,
  CalendarCheck,
  ShieldCheck,
  Flame,
} from 'lucide-react';
import { api, getCached } from '@/frontend/api';
import { todayStr, lastNDays, calcRecoveryStreak, calcLongestStreak, fmtDate, cn } from '@/shared/utils';
import type { RecoveryLog, RecoverySettings } from '@/shared/types';
import GlassCard from '@/frontend/components/ui/GlassCard';
import Modal from '@/frontend/components/ui/Modal';
import EmptyState from '@/frontend/components/ui/EmptyState';
import StatCard from '@/frontend/components/ui/StatCard';
import PrivacyToggleButton from '@/frontend/components/ui/PrivacyToggleButton';
import { usePrivacyMode } from '@/frontend/hooks/usePrivacyMode';
import { useConfirm } from '@/frontend/hooks/useConfirm';
import RecoveryHeatmap from '@/frontend/components/recovery/RecoveryHeatmap';

const MILESTONES = [7, 30, 90, 180, 365];

/** لقب المرحلة حسب طول السلسلة الحالية — نفس طابع الألعاب في قسم التعلم */
function levelOf(streak: number): { title: string; icon: string } {
  if (streak >= 365) return { title: 'عام كامل', icon: '👑' };
  if (streak >= 180) return { title: 'نصف عام', icon: '🛡️' };
  if (streak >= 90) return { title: 'ثلاثة أشهر', icon: '🏅' };
  if (streak >= 30) return { title: 'شهر كامل', icon: '⭐' };
  if (streak >= 7) return { title: 'أسبوع كامل', icon: '🔥' };
  if (streak >= 1) return { title: 'مستمر', icon: '💪' };
  return { title: 'البداية', icon: '🌱' };
}

const COPING_TIPS = [
  'اخرج من المكان أو الموقف الحالي فوراً',
  'اتصل بصديق تثق به أو تحدّث مع أحد',
  'مارس نشاطاً بدنياً سريعاً — مشي، تمارين، دُش بارد',
  'طبّق قاعدة العشر دقائق: أجّل القرار وانتظر — الرغبة تخفّ مع الوقت',
  'اشغل يديك وذهنك بعمل آخر — قراءة، هواية، ترتيب',
  'تذكّر سبب بدء رحلتك، واكتب شعورك الآن',
  'صلِّ أو اذكر الله إن كان ذلك يمنحك سكينة',
  'لا تُعاقب نفسك عند الانتكاس — سجّلها وتعلّم منها واستمر',
];

const onForm =
  (fn: (f: FormData) => void) => (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    fn(new FormData(e.currentTarget));
  };

export default function RecoveryPage() {
  const today = todayStr();
  const week = lastNDays(7);

  const [logs, setLogs] = useState<RecoveryLog[]>(() => getCached<RecoveryLog[]>('/api/crud/recoveryLogs') ?? []);
  const [settings, setSettings] = useState<RecoverySettings | null>(
    () => getCached<RecoverySettings | null>('/api/recovery/settings') ?? null
  );
  const [modal, setModal] = useState<null | 'settings' | 'relapse'>(null);
  const { confirm, ConfirmDialog } = useConfirm();
  const { showBalances: showDetails, togglePrivacy, moneyBlur: detailBlur } = usePrivacyMode('recovery-show-details');

  const load = useCallback(async () => {
    const [l, s] = await Promise.all([
      api<RecoveryLog[]>('/api/crud/recoveryLogs'),
      api<RecoverySettings | null>('/api/recovery/settings'),
    ]);
    if (l) setLogs(l);
    setSettings(s);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const cleanDates = new Set(logs.filter((l) => l.status === 'clean').map((l) => l.date));
  const relapseDates = new Set(logs.filter((l) => l.status === 'relapse').map((l) => l.date));
  const streak = calcRecoveryStreak(cleanDates, relapseDates);
  const longest = settings ? calcLongestStreak(cleanDates, relapseDates, settings.startDate) : streak;
  const level = levelOf(streak);
  const todayStatus: 'clean' | 'relapse' | 'none' = relapseDates.has(today) ? 'relapse' : cleanDates.has(today) ? 'clean' : 'none';
  const recentRelapses = logs.filter((l) => l.status === 'relapse').slice(0, 8);

  // ===== تسجيل يوم نظيف (تبديل: نقرة ثانية تُلغي تسجيل اليوم) =====
  const markClean = async () => {
    if (todayStatus === 'clean') {
      const row = logs.find((l) => l.date === today);
      if (!row) return;
      setLogs((prev) => prev.filter((l) => l.date !== today));
      await api(`/api/crud/recoveryLogs/${row.id}`, { method: 'DELETE' });
      load();
      return;
    }

    const beforeStreak = streak;
    setLogs((prev) => [
      { id: `temp-${today}`, date: today, status: 'clean', trigger: null, createdAt: new Date().toISOString() },
      ...prev.filter((l) => l.date !== today),
    ]);
    const afterClean = new Set(cleanDates).add(today);
    const afterRelapse = new Set(relapseDates);
    afterRelapse.delete(today);
    const afterStreak = calcRecoveryStreak(afterClean, afterRelapse);
    const crossed = MILESTONES.find((m) => beforeStreak < m && afterStreak >= m);

    await api('/api/crud/recoveryLogs', {
      method: 'POST',
      ok: crossed ? `🏅 ${crossed} يوماً متتالياً — إنجاز رائع!` : undefined,
      body: { date: today, status: 'clean' },
    });
    load();
  };

  // ===== تسجيل انتكاسة =====
  const logRelapse = async (f: FormData) => {
    const ok = await api('/api/crud/recoveryLogs', {
      method: 'POST',
      ok: 'سُجّلت — لا بأس، المهم أن تستأنف من الآن',
      body: {
        date: String(f.get('date') || today),
        status: 'relapse',
        trigger: String(f.get('trigger') || ''),
      },
    });
    if (ok) {
      setModal(null);
      load();
    }
  };

  const deleteLog = async (id: string) => {
    const ok1 = await confirm({
      title: 'حذف السجل',
      description: 'سيُحذف هذا السجل نهائياً ولا يمكن التراجع عن هذا الإجراء.',
      danger: true,
    });
    if (!ok1) return;
    const ok = await api(`/api/crud/recoveryLogs/${id}`, { method: 'DELETE' });
    if (ok) load();
  };

  // ===== إعدادات بداية الرحلة =====
  const saveSettings = async (f: FormData) => {
    const ok = await api('/api/recovery/settings', {
      method: 'POST',
      ok: 'حُدِّدت بداية الرحلة 🌱',
      body: { startDate: String(f.get('startDate') || '') },
    });
    if (ok) {
      setModal(null);
      load();
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">التعافي</h1>
          <p className="text-sm text-slate-500">رحلتك نحو الانضباط والصفاء — يوماً بيوم</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="chip border border-emerald-500/25 bg-emerald-500/10 !px-3 !py-1.5 text-emerald-300">
            {level.icon} {level.title}
          </span>
          <PrivacyToggleButton
            visible={showDetails}
            onToggle={togglePrivacy}
            showLabel="إخفاء التفاصيل"
            hideLabel="إظهار التفاصيل"
          />
        </div>
      </header>

      {/* ===== بداية الرحلة ===== */}
      <GlassCard className="border-emerald-500/25 bg-gradient-to-br from-emerald-500/[0.1] via-transparent to-transparent !p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/15 p-2 text-emerald-300">
              <HeartPulse size={20} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-400/80">بداية الرحلة</p>
              {settings ? (
                <h2 className={cn('text-base font-black leading-tight', detailBlur)}>{fmtDate(settings.startDate)}</h2>
              ) : (
                <p className="text-xs text-slate-500">حدد تاريخ بداية رحلتك لبدء الاحتساب</p>
              )}
            </div>
          </div>
          <button className="btn-ghost !px-2.5 !py-1.5 text-xs" onClick={() => setModal('settings')}>
            <Pencil size={12} /> {settings ? 'تعديل' : 'تحديد'}
          </button>
        </div>
      </GlassCard>

      {/* ===== إحصائيات ===== */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard title="السلسلة الحالية" value={`${streak} يوم`} icon={Flame} tone="emerald" blurred={!showDetails} />
        <StatCard title="أطول سلسلة" value={`${longest} يوم`} icon={Trophy} tone="violet" blurred={!showDetails} />
        <StatCard title="إجمالي الأيام النظيفة" value={String(cleanDates.size)} icon={CalendarCheck} tone="sky" blurred={!showDetails} />
        <StatCard title="انتكاسات مسجَّلة" value={String(relapseDates.size)} icon={AlertTriangle} tone="rose" blurred={!showDetails} />
      </div>

      {/* ===== اليوم ===== */}
      <GlassCard className="!p-4">
        <div className="mb-3">
          <h3 className="text-base font-black">اليوم</h3>
          <p className="text-[11px] text-slate-500">
            {todayStatus === 'clean'
              ? '✅ سجّلت اليوم كيوم نظيف'
              : todayStatus === 'relapse'
                ? '⚠️ سجّلت اليوم كانتكاسة'
                : 'لم تُسجَّل اليوم بعد'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={markClean}
            className={cn(
              'flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition',
              todayStatus === 'clean' ? 'border border-emerald-500/30 bg-emerald-500/15 text-emerald-300' : 'btn-primary'
            )}
          >
            <CheckCircle2 size={16} /> {todayStatus === 'clean' ? '✓ نظيف اليوم' : 'تسجيل يوم نظيف'}
          </button>
          <button
            onClick={() => setModal('relapse')}
            className={cn(
              'flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold transition',
              todayStatus === 'relapse'
                ? 'border-rose-500/40 bg-rose-500/15 text-rose-300'
                : 'border-rose-500/20 bg-rose-500/5 text-rose-400 hover:bg-rose-500/10'
            )}
          >
            <AlertTriangle size={16} /> تسجيل انتكاسة
          </button>
        </div>
        <div className="mt-4 flex items-center gap-1">
          {week.map((d) => {
            const cls = relapseDates.has(d) ? 'bg-rose-400' : cleanDates.has(d) ? 'bg-emerald-400' : 'bg-white/[0.07]';
            return <div key={d} title={d} className={cn('h-2 flex-1 rounded-full', cls)} />;
          })}
        </div>
      </GlassCard>

      {/* ===== الخريطة الحرارية ===== */}
      <RecoveryHeatmap logs={logs} blurred={!showDetails} />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ===== سجل الانتكاسات ===== */}
        <GlassCard>
          <h3 className="section-title mb-3">📋 سجل الانتكاسات الأخيرة</h3>
          {recentRelapses.length === 0 ? (
            <EmptyState icon={ShieldCheck} title="لا انتكاسات مسجّلة" hint="استمر — كل يوم نظيف يبني رصيدك" />
          ) : (
            <div className={cn('flex flex-col gap-2', detailBlur)}>
              {recentRelapses.map((l) => (
                <div key={l.id} className="group glass-inset flex items-start gap-2.5 p-2.5">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0 text-rose-400" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-300">{fmtDate(l.date)}</p>
                    {l.trigger && <p className="mt-0.5 text-[11px] text-slate-500">{l.trigger}</p>}
                  </div>
                  <button
                    className="shrink-0 text-slate-700 opacity-0 transition group-hover:opacity-100 hover:!text-rose-400"
                    onClick={() => deleteLog(l.id)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </GlassCard>

        {/* ===== نصائح واستراتيجيات تأقلم ===== */}
        <GlassCard>
          <h3 className="section-title mb-3">💡 عند الشعور بالرغبة</h3>
          <ul className="flex flex-col gap-2.5">
            {COPING_TIPS.map((tip, i) => (
              <li key={i} className="flex items-start gap-2.5 text-xs text-slate-400">
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-[9px] font-black text-emerald-300">
                  {i + 1}
                </span>
                {tip}
              </li>
            ))}
          </ul>
        </GlassCard>
      </div>

      {/* ===== النوافذ ===== */}
      <Modal open={modal === 'settings'} onClose={() => setModal(null)} title="بداية رحلة التعافي">
        <form onSubmit={onForm(saveSettings)} className="flex flex-col gap-4">
          <p className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-200">
            يمكنك اختيار تاريخ سابق إن كنت ملتزماً بالفعل قبل استخدام هذا القسم — سيُحتسب تلقائياً كأيام نظيفة.
          </p>
          <div>
            <label className="label">تاريخ البداية</label>
            <input
              name="startDate"
              type="date"
              className="input"
              required
              max={today}
              defaultValue={settings?.startDate ?? today}
            />
          </div>
          <button className="btn-primary">حفظ</button>
        </form>
      </Modal>

      <Modal open={modal === 'relapse'} onClose={() => setModal(null)} title="تسجيل انتكاسة">
        <form onSubmit={onForm(logRelapse)} className="flex flex-col gap-4">
          <p className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-200">
            لا بأس — التسجيل بصدق جزء من التعافي. المهم أن تستأنف من الآن.
          </p>
          <div>
            <label className="label">التاريخ</label>
            <input name="date" type="date" className="input" required max={today} defaultValue={today} />
          </div>
          <div>
            <label className="label">المحفز أو الموقف (اختياري)</label>
            <textarea name="trigger" className="input" rows={3} placeholder="ما الذي سبق ذلك؟ يساعدك على ملاحظة الأنماط لاحقاً…" />
          </div>
          <button className="btn-primary">حفظ التسجيل</button>
        </form>
      </Modal>

      <ConfirmDialog />
    </div>
  );
}
