import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-lg border border-amber-900/10 bg-white/80 px-3 py-2 text-base shadow-warm-sm transition-all duration-200 file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground/60 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500/30 focus-visible:border-amber-300 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:border-amber-100/10 dark:bg-amber-950/20 dark:placeholder:text-amber-100/30 dark:focus-visible:ring-amber-500/30 dark:focus-visible:border-amber-700",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
