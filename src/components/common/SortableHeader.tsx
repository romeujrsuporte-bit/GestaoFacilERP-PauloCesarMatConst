import React from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

export type SortDirection = 'asc' | 'desc';

export interface SortConfig<K extends string = string> {
  key: K | null;
  direction: SortDirection;
}

export function toggleSortConfig<K extends string>(prev: SortConfig<K>, key: K): SortConfig<K> {
  if (prev.key === key) {
    return {
      key,
      direction: prev.direction === 'asc' ? 'desc' : 'asc',
    };
  }
  return {
    key,
    direction: 'asc',
  };
}

export function compareSortValues(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
  direction: SortDirection
): number {
  const factor = direction === 'asc' ? 1 : -1;

  if (typeof a === 'number' && typeof b === 'number') {
    const safeA = Number.isFinite(a) ? a : 0;
    const safeB = Number.isFinite(b) ? b : 0;
    return (safeA - safeB) * factor;
  }

  const strA = String(a ?? '').trim();
  const strB = String(b ?? '').trim();
  return strA.localeCompare(strB, 'pt-BR', { numeric: true, sensitivity: 'base' }) * factor;
}

export function parseSortableDate(value?: string | null): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

interface SortableThProps<K extends string> {
  label: React.ReactNode;
  sortKey: K;
  sortConfig: SortConfig<K>;
  onSort: (key: K) => void;
  align?: 'left' | 'right' | 'center';
  subtitle?: React.ReactNode;
  className?: string;
}

export function SortableTh<K extends string>({
  label,
  sortKey,
  sortConfig,
  onSort,
  align = 'left',
  subtitle,
  className = '',
}: SortableThProps<K>) {
  const isActive = sortConfig.key === sortKey;
  const isAsc = isActive && sortConfig.direction === 'asc';
  const isDesc = isActive && sortConfig.direction === 'desc';

  const alignClass =
    align === 'right'
      ? 'text-right'
      : align === 'center'
      ? 'text-center'
      : 'text-left';

  const flexAlignClass =
    align === 'right'
      ? 'justify-end'
      : align === 'center'
      ? 'justify-center'
      : 'justify-start';

  const tooltip = isActive
    ? isAsc
      ? 'Ordenado em ordem crescente — clique para ordenar decrescente'
      : 'Ordenado em ordem decrescente — clique para ordenar crescente'
    : 'Clique para ordenar em ordem crescente';

  return (
    <th
      onClick={() => onSort(sortKey)}
      title={tooltip}
      aria-sort={isActive ? (isAsc ? 'ascending' : 'descending') : 'none'}
      className={`p-3 cursor-pointer select-none group transition-colors hover:bg-slate-100/90 hover:text-slate-900 ${
        isActive ? 'bg-blue-50/70 text-blue-700' : ''
      } ${alignClass} ${className}`}
    >
      <div className={`inline-flex items-center gap-1 ${flexAlignClass}`}>
        <span>{label}</span>
        {isAsc ? (
          <ArrowUp size={12} className="text-blue-600 shrink-0" />
        ) : isDesc ? (
          <ArrowDown size={12} className="text-blue-600 shrink-0" />
        ) : (
          <ArrowUpDown
            size={11}
            className="text-slate-300 group-hover:text-slate-500 shrink-0 transition-colors"
          />
        )}
      </div>
      {subtitle && (
        <span className="block text-[9px] text-slate-400 font-normal lowercase">
          {subtitle}
        </span>
      )}
    </th>
  );
}
