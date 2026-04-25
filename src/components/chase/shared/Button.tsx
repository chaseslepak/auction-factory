import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-navy text-white hover:bg-brand-navy/90 focus-visible:ring-brand-navy',
  secondary: 'bg-white text-brand-navy border border-slate-300 hover:bg-slate-50 focus-visible:ring-brand-blue',
  ghost: 'bg-transparent text-slate-700 hover:bg-slate-100 focus-visible:ring-slate-300',
  danger: 'bg-rose-600 text-white hover:bg-rose-500 focus-visible:ring-rose-400',
};

export default function Button({
  variant = 'primary',
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; children: ReactNode }) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${VARIANTS[variant]} ${className}`}
    >
      {children}
    </button>
  );
}
