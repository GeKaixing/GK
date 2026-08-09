import clsx from "clsx"
import React from "react"

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  className?: string
  children: React.ReactNode
}

export default function Button({ children, className, ...props }: ButtonProps) {
  return (
    <button
      className={clsx(
        'h-9 w-2xs rounded-2xl border border-border bg-background text-foreground flex justify-center items-center transition-colors hover:bg-muted hover:text-black',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}
