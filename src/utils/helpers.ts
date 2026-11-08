// Dynamically import canvas-confetti only when invoked to keep initial bundle size minimal
export const triggerConfetti = async () => {
  if (typeof window === 'undefined') return;
  try {
    const confettiModule = await import('canvas-confetti');
    const confetti = confettiModule.default;
    confetti({
      particleCount: 70,
      spread: 60,
      origin: { y: 0.6 },
      colors: ['#f97316', '#fb923c', '#fdba74', '#10b981', '#38bdf8'],
      disableForReducedMotion: true,
    });
  } catch (err) {
    console.error('Confetti trigger failed:', err);
  }
};

export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 0,
  }).format(amount);
};
