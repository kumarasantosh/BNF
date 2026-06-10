import { cn } from '@/lib/utils';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  label?: string;
}

const SIZE: Record<string, string> = {
  sm: 'h-4 w-4 border-2',
  md: 'h-7 w-7 border-2',
  lg: 'h-10 w-10 border-[3px]',
};

export default function LoadingSpinner({ size = 'md', className, label }: LoadingSpinnerProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3', className)}>
      <span
        role="status"
        aria-label={label ?? 'Loading'}
        className={cn(
          'animate-spin rounded-full border-slate-600 border-t-blue-400',
          SIZE[size],
        )}
      />
      {label && <p className="text-xs text-slate-500">{label}</p>}
    </div>
  );
}
