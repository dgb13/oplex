import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cn } from "cn"

// `hasError` es la API que ya usan los 7 formularios de (auth)/* (via
// react-hook-form) - se traduce a `aria-invalid` en vez de agregar una
// clase de error a mano, así se aprovechan los estilos `aria-invalid:*`
// que ya trae este componente generado por shadcn.
interface InputProps extends React.ComponentProps<"input"> {
  hasError?: boolean
}

function Input({ className, type, hasError, ...props }: InputProps) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      aria-invalid={hasError || undefined}
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
