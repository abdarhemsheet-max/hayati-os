'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/shared/utils';

const DEFAULT_STORAGE_KEY = 'finance-show-balances';

/**
 * وضع الخصوصية — تفضيل تمويه محلي بالكامل (localStorage) لتبديل فوري بلا
 * أي تأخير شبكي أو استعلام قاعدة بيانات. المفتاح الافتراضي يخص المالية
 * (الرئيسية وقسم المالية يتشاركانه)؛ أقسام أخرى حساسة (مثل التعافي) تمرر
 * مفتاحها الخاص لتفضيل مستقل.
 */
export function usePrivacyMode(storageKey: string = DEFAULT_STORAGE_KEY) {
  const [showBalances, setShowBalances] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved !== null) setShowBalances(saved === 'true');
  }, [storageKey]);

  const togglePrivacy = () => {
    setShowBalances((prev) => {
      const next = !prev;
      localStorage.setItem(storageKey, String(next));
      return next;
    });
  };

  /** صنف تمويه جاهز للنصوص المالية المضمّنة (خارج StatCard) */
  const moneyBlur = cn(!showBalances && 'blur-md select-none', 'transition-all duration-200');

  return { showBalances, togglePrivacy, moneyBlur };
}
