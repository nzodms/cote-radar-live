import { cn } from "@/lib/utils";

interface Props {
  name: string;
  logo?: string | null;
  size?: number;
  className?: string;
}

/** Logo d'équipe avec fallback initiales si l'URL est absente. */
export function TeamLogo({ name, logo, size = 28, className }: Props) {
  const initials = (name || "?")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  if (logo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logo}
        alt={name}
        width={size}
        height={size}
        loading="lazy"
        referrerPolicy="no-referrer"
        className={cn("inline-block rounded-sm object-contain", className)}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-sm bg-night-700 text-[10px] font-semibold text-slate-300",
        className
      )}
      style={{ width: size, height: size }}
      aria-label={name}
    >
      {initials}
    </span>
  );
}
