"use client";

import { cn } from "@/lib/utils";

interface SliderProps {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  className?: string;
}

/** Lightweight styled range slider with a filled track. */
export function Slider({
  value,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  disabled,
  className,
}: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className={cn("relative flex h-6 w-full items-center", className)}>
      <div className="absolute h-1.5 w-full rounded-full bg-muted-foreground/15" />
      <div
        className="absolute h-1.5 rounded-full bg-primary-gradient"
        style={{ width: `${pct}%` }}
      />
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onValueChange(Number(e.target.value))}
        className="slider-input absolute h-6 w-full cursor-pointer appearance-none bg-transparent disabled:cursor-not-allowed"
        style={{ WebkitAppearance: "none" }}
      />
      <style jsx>{`
        .slider-input::-webkit-slider-thumb {
          -webkit-appearance: none;
          height: 18px;
          width: 18px;
          border-radius: 9999px;
          background: white;
          border: 1px solid hsl(var(--border-strong));
          box-shadow: 0 1px 3px rgba(16, 24, 40, 0.18), 0 0 0 4px hsl(var(--primary) / 0.08);
          cursor: pointer;
          transition: box-shadow 0.2s ease, transform 0.1s ease;
        }
        .slider-input::-webkit-slider-thumb:active {
          transform: scale(1.08);
          box-shadow: 0 1px 3px rgba(16, 24, 40, 0.2), 0 0 0 6px hsl(var(--primary) / 0.16);
        }
        .slider-input::-moz-range-thumb {
          height: 18px;
          width: 18px;
          border-radius: 9999px;
          background: white;
          border: 1px solid hsl(var(--border-strong));
          box-shadow: 0 1px 3px rgba(16, 24, 40, 0.18);
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
