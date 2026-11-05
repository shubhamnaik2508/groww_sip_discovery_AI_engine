'use client';

import { useTransition } from 'react';
import { seedBenchmarkDatasetAction } from '@/app/actions';

export function SeedButton({ hasData }: { hasData: boolean }) {
  const [isPending, startTransition] = useTransition();

  const handleSeed = () => {
    if (hasData) {
      const confirmed = window.confirm(
        'This loads curated benchmark fixture records, simulated analyses and sample labels for the unified discovery views. They remain illustrative and never count as genuine investor research. Continue?'
      );
      if (!confirmed) return;
    }

    startTransition(async () => {
      const res = await seedBenchmarkDatasetAction();
      if (!res.success) {
        alert('Failed to load benchmark dataset: ' + (res as any).error);
      }
    });
  };

  return (
    <button
      onClick={handleSeed}
      disabled={isPending}
      className={hasData ? 'btn btn-secondary' : 'btn btn-primary'}
      style={{ fontSize: '13px' }}
    >
      {isPending ? '⏳ Loading Benchmark Fixtures...' : 'Load Curated Benchmark Fixtures'}
    </button>
  );
}
