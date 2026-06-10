import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  title?: string;
  titleRight?: ReactNode;
}

export default function Card({ children, className, title, titleRight }: CardProps) {
  return (
    <div className={cn('rounded-xl border border-[#2a2d3e] bg-[#1a1d27] shadow-lg', className)}>
      {title && (
        <div className="flex items-center justify-between border-b border-[#2a2d3e] px-5 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">{title}</h2>
          {titleRight && <div className="text-xs text-slate-500">{titleRight}</div>}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}
