'use client';

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatBRL, formatBRLThousands } from '@/lib/format';

// MonthBars (Screen 5b): outflows per month, stacked by group. The 5 largest groups get a chart color; the others
// stack in one neutral tone and share the "Outros" legend entry. Recharts stacks the builder's own values: this
// file adds nothing up. Loaded with next/dynamic (month-bars.client.tsx), so Recharts stays out of the first load.

export interface MonthBarsSeries {
  key: string;
  label: string;
  /** null: one of the "Outros" (neutral color). */
  color: string | null;
  cents: number[];
}

export interface MonthBarsProps {
  months: string[];
  series: MonthBarsSeries[];
}

const OTHERS = 'var(--surface-3)';

export default function MonthBarsChart({ months, series }: MonthBarsProps) {
  const data = months.map((label, i) => {
    const row: Record<string, number | string> = { label };
    for (const s of series) row[s.key] = s.cents[i] ?? 0;
    return row;
  });
  const names = new Map(series.map((s) => [s.key, s.label]));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }} barCategoryGap="22%">
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
          tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
        />
        <YAxis
          width={64}
          tickLine={false}
          axisLine={false}
          tickCount={4}
          tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
          tickFormatter={(v: number) => (Number.isSafeInteger(v) ? formatBRLThousands(v) : '')}
        />
        <Tooltip
          cursor={{ fill: 'var(--surface-2)' }}
          contentStyle={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            fontSize: 12,
            color: 'var(--text)',
          }}
          formatter={(value, key) => [
            typeof value === 'number' ? formatBRL(value) : String(value),
            names.get(String(key)) ?? String(key),
          ]}
          itemSorter={(item) => -(Number(item.value) || 0)}
          filterNull
        />
        {series.map((s) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            stackId="out"
            fill={s.color ?? OTHERS}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
