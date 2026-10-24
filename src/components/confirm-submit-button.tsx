"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

export function ConfirmSubmitButton({ confirmMessage, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { confirmMessage: string; children: ReactNode }) {
  return (
    <button
      {...props}
      type="submit"
      onClick={(event) => {
        if (!window.confirm(confirmMessage)) event.preventDefault();
        props.onClick?.(event);
      }}
    >
      {children}
    </button>
  );
}
