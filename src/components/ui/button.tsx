import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "@radix-ui/react-slot";
import * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-[transform,background-color,color,box-shadow,opacity] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-accent text-accent-fg shadow-border hover:bg-fg active:scale-[0.96]",
        secondary:
          "bg-elevated text-fg shadow-border hover:bg-pad active:scale-[0.96]",
        ghost:
          "bg-transparent text-muted hover:bg-elevated hover:text-fg active:scale-[0.96]",
        outline:
          "bg-transparent text-fg shadow-border hover:bg-elevated active:scale-[0.96]",
        danger:
          "bg-transparent text-muted hover:bg-elevated hover:text-fg active:scale-[0.96]",
      },
      size: {
        sm: "h-9 rounded-md px-3 text-sm",
        md: "h-10 rounded-md px-3.5 text-sm",
        lg: "h-12 rounded-lg px-5 text-sm",
        icon: "size-10 rounded-md",
        play: "size-14 rounded-xl",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "md",
    },
  },
);

export type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { buttonVariants };
