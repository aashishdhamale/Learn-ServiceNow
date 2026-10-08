import { cn } from '@/lib/utils';

/** A completion meter: the track is a lighter step of the fill hue; the label carries the value. */
export function Meter({
  value,
  max,
  label,
  className,
}: {
  value: number;
  max: number;
  label: string;
  className?: string;
}) {
  const percent = max === 0 ? 0 : Math.round((value / max) * 100);
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-success/20', className)}
    >
      <div
        className="h-full rounded-full bg-success transition-[width]"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
