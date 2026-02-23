"use client";

import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "@/lib/utils";

const Slider = React.forwardRef<
  React.ComponentRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn(
      "relative flex w-full touch-none select-none items-center",
      className
    )}
    {...props}
  >
    <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-amber-100 dark:bg-amber-900/20">
      <SliderPrimitive.Range className="absolute h-full bg-gradient-to-r from-amber-500 to-amber-400 dark:from-amber-600 dark:to-amber-500" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb className="block h-5 w-5 rounded-full border-2 border-amber-500 bg-white shadow-warm transition-all duration-200 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500/40 hover:scale-110 disabled:pointer-events-none disabled:opacity-50 dark:border-amber-400 dark:bg-amber-950" />
  </SliderPrimitive.Root>
));
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
