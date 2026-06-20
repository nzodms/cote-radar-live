"use client";

import { useState } from "react";
import { Package } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProductImageProps {
  src: string;
  alt: string;
  className?: string;
  rounded?: string;
}

/**
 * Product thumbnail with a graceful styled fallback when the remote image
 * fails to load — keeps the demo looking premium even offline.
 */
export function ProductImage({ src, alt, className, rounded = "rounded-xl" }: ProductImageProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-gradient-to-br from-secondary to-accent/60 text-muted-foreground",
          rounded,
          className,
        )}
      >
        <Package className="h-1/3 w-1/3 opacity-50" />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn("object-cover", rounded, className)}
    />
  );
}
