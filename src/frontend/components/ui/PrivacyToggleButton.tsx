'use client';

import { Eye, EyeOff } from 'lucide-react';

/** زر خصوصية زجاجي موحّد — يُستخدم في الرئيسية وقسم المالية والتعافي */
export default function PrivacyToggleButton({
  visible,
  onToggle,
  showLabel = 'إخفاء المبالغ',
  hideLabel = 'إظهار المبالغ',
}: {
  visible: boolean;
  onToggle: () => void;
  /** نص العنوان عندما تكون البيانات ظاهرة (سيُخفيها الضغط) */
  showLabel?: string;
  /** نص العنوان عندما تكون البيانات مموّهة (سيُظهرها الضغط) */
  hideLabel?: string;
}) {
  const label = visible ? showLabel : hideLabel;
  return (
    <button
      onClick={onToggle}
      title={label}
      aria-label={label}
      className="group relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-slate-400 backdrop-blur-xl transition hover:border-emerald-500/30 hover:bg-white/10 hover:text-emerald-300"
    >
      {visible ? <Eye size={17} /> : <EyeOff size={17} />}
    </button>
  );
}
