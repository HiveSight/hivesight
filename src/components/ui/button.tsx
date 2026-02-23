import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-200 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500/40 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-amber-600 text-white shadow-sm hover:bg-amber-700 active:bg-amber-800 dark:bg-amber-500 dark:text-amber-950 dark:hover:bg-amber-400",
        destructive:
          "bg-red-500 text-white shadow-xs hover:bg-red-600 dark:bg-red-900 dark:text-red-50 dark:hover:bg-red-800",
        outline:
          "border border-amber-900/10 bg-white/80 shadow-warm-sm hover:bg-amber-50 hover:border-amber-200 hover:text-amber-900 dark:border-amber-100/10 dark:bg-transparent dark:hover:bg-amber-950/30 dark:hover:text-amber-100",
        secondary:
          "bg-amber-100/60 text-amber-900 shadow-xs hover:bg-amber-100 dark:bg-amber-900/20 dark:text-amber-100 dark:hover:bg-amber-900/30",
        ghost:
          "hover:bg-amber-50 hover:text-amber-900 dark:hover:bg-amber-950/30 dark:hover:text-amber-100",
        link: "text-amber-700 underline-offset-4 hover:underline dark:text-amber-400",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-11 rounded-lg px-8 text-base",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      /* eslint-disable-next-line @typescript-eslint/ban-ts-comment */
      // @ts-ignore React 18 types incompatibility with @radix-ui/react-slot
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
