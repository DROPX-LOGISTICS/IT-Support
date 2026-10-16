"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * A filter bar that applies itself: choosing from a list, ticking a box or picking a date reloads the results;
 * typed text applies on Enter. Without JavaScript it is an ordinary GET form.
 * Give it a `key` made from the current filters so the fields follow links that change them.
 */
export function FilterForm({ action, className, style, children }: { action: string; className?: string; style?: React.CSSProperties; children: React.ReactNode }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const go = (form: HTMLFormElement) => {
    const params = new URLSearchParams();
    new FormData(form).forEach((v, k) => { if (typeof v === "string" && v.trim()) params.set(k, v.trim()); });
    const qs = params.toString();
    start(() => router.push(qs ? `${action}?${qs}` : action));
  };
  return (
    <form method="get" action={action} className={className} style={{ ...style, opacity: pending ? 0.7 : undefined, transition: "opacity .15s" }} aria-busy={pending}
      onSubmit={(e) => { e.preventDefault(); go(e.currentTarget); }}
      onChange={(e) => {
        const t = e.target;
        if (t instanceof HTMLSelectElement || (t instanceof HTMLInputElement && (t.type === "checkbox" || t.type === "date"))) go(e.currentTarget);
      }}>
      {children}
    </form>
  );
}
