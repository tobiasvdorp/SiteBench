import * as SheetPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { useCallback, useRef, useState, type ComponentPropsWithoutRef, type HTMLAttributes, type PointerEvent as ReactPointerEvent } from "react";
import {
  clampRunDetailSheetWidth,
  getRunDetailSheetWidth,
  setRunDetailSheetWidth,
} from "@/lib/run-detail-preferences";
import { cn } from "@/lib/utils";

const Sheet = SheetPrimitive.Root;
const SheetTrigger = SheetPrimitive.Trigger;
const SheetClose = SheetPrimitive.Close;
const SheetPortal = SheetPrimitive.Portal;

function SheetOverlay({ className, ...props }: ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      className={cn(
        "fixed inset-0 z-50 bg-background/70 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        className,
      )}
      {...props}
    />
  );
}

const sheetVariants = cva(
  "fixed z-50 gap-4 bg-surface-overlay p-6 shadow-2xl transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500 data-[state=open]:animate-in data-[state=closed]:animate-out",
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
        bottom:
          "inset-x-0 bottom-0 border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
        left: "inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm",
        right:
          "inset-y-0 right-0 h-full w-3/4 border-l border-border/60 data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-xl",
      },
    },
    defaultVariants: {
      side: "right",
    },
  },
);

type SheetContentProps = ComponentPropsWithoutRef<typeof SheetPrimitive.Content> &
  VariantProps<typeof sheetVariants> & {
    resizable?: boolean;
  };

function SheetResizeHandle({
  side,
  onResize,
  onResizeEnd,
}: {
  side: NonNullable<VariantProps<typeof sheetVariants>["side"]>;
  onResize: (width: number) => void;
  onResizeEnd: (width: number) => void;
}) {
  const dragging = useRef(false);
  const widthRef = useRef(0);

  const updateWidth = useCallback(
    (clientX: number) => {
      const next =
        side === "left"
          ? clampRunDetailSheetWidth(clientX)
          : clampRunDetailSheetWidth(window.innerWidth - clientX);
      widthRef.current = next;
      onResize(next);
    },
    [onResize, side],
  );

  const endResize = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    document.body.style.removeProperty("user-select");
    document.body.style.removeProperty("cursor");
    onResizeEnd(widthRef.current);
  }, [onResizeEnd]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "ew-resize";
    updateWidth(event.clientX);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    updateWidth(event.clientX);
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    endResize();
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panel"
      className={cn(
        "absolute top-0 z-20 h-full w-2 touch-none select-none",
        "cursor-ew-resize before:absolute before:top-0 before:h-full before:w-px before:bg-border/60 before:transition-colors",
        "hover:before:bg-primary/50 active:before:bg-primary",
        side === "right" ? "left-0 before:left-1/2 before:-translate-x-1/2" : "right-0 before:right-1/2 before:translate-x-1/2",
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onLostPointerCapture={endResize}
    />
  );
}

function SheetContent({ side = "right", className, children, resizable = false, style, ...props }: SheetContentProps) {
  const [width, setWidth] = useState(getRunDetailSheetWidth);
  const isResizable = resizable && (side === "right" || side === "left");

  const handleResizeEnd = useCallback((nextWidth: number) => {
    setRunDetailSheetWidth(nextWidth);
  }, []);

  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        className={cn(sheetVariants({ side }), isResizable && "!w-auto !max-w-none sm:!max-w-none", className)}
        style={isResizable ? { ...style, width } : style}
        {...props}
      >
        {isResizable && (
          <SheetResizeHandle side={side} onResize={setWidth} onResizeEnd={handleResizeEnd} />
        )}
        {children}
        <SheetPrimitive.Close className="absolute right-4 top-4 cursor-pointer rounded-lg p-1.5 opacity-60 ring-offset-background transition-all hover:bg-accent hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none disabled:cursor-not-allowed">
          <X className="size-4" />
          <span className="sr-only">Close</span>
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col space-y-2 text-center sm:text-left", className)} {...props} />;
}

function SheetFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props} />;
}

function SheetTitle({ className, ...props }: ComponentPropsWithoutRef<typeof SheetPrimitive.Title>) {
  return <SheetPrimitive.Title className={cn("text-lg font-semibold tracking-tight text-foreground", className)} {...props} />;
}

function SheetDescription({ className, ...props }: ComponentPropsWithoutRef<typeof SheetPrimitive.Description>) {
  return <SheetPrimitive.Description className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
