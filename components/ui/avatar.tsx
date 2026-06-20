import { cn } from "@/lib/utils";

const GRADIENTS = [
  "from-blue-500 to-indigo-500",
  "from-violet-500 to-fuchsia-500",
  "from-emerald-500 to-teal-500",
  "from-amber-500 to-orange-500",
  "from-rose-500 to-pink-500",
  "from-cyan-500 to-sky-500",
];

function pick(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return GRADIENTS[h % GRADIENTS.length];
}

interface AvatarProps {
  initials: string;
  seed?: string;
  online?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function Avatar({ initials, seed, online, size = "md", className }: AvatarProps) {
  const dim =
    size === "sm" ? "h-8 w-8 text-xs" : size === "lg" ? "h-12 w-12 text-base" : "h-10 w-10 text-sm";
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-full bg-gradient-to-br font-semibold text-white shadow-sm ring-2 ring-white",
          dim,
          pick(seed ?? initials),
        )}
      >
        {initials}
      </span>
      {online !== undefined && (
        <span
          className={cn(
            "absolute -bottom-0 -right-0 h-3 w-3 rounded-full ring-2 ring-white",
            online ? "bg-success" : "bg-muted-foreground/40",
          )}
        />
      )}
    </span>
  );
}
