// Komponen tampilan dasar yang dipakai ulang di seluruh halaman.
const gabung = (...c) => c.filter(Boolean).join(' ');

// ---------- Tombol ----------
const GAYA_TOMBOL = {
  green: 'bg-green text-white hover:bg-green-hover disabled:hover:bg-green',
  primary: 'bg-primary text-white hover:bg-primary-hover disabled:hover:bg-primary',
  outline: 'bg-transparent border border-line text-ink hover:bg-raised hover:border-dim',
  danger: 'bg-red/10 border border-red/25 text-red hover:bg-red hover:text-white',
  ghost: 'bg-transparent text-dim hover:text-ink hover:bg-raised',
};

export function Button({ variant = 'outline', className, children, ...rest }) {
  return (
    <button
      className={gabung(
        'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5',
        'text-sm font-semibold transition-colors cursor-pointer',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        GAYA_TOMBOL[variant], className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

// ---------- Badge ----------
const GAYA_BADGE = {
  netral: 'bg-raised text-dim',
  green: 'bg-green/12 text-green',
  red: 'bg-red/12 text-red',
  amber: 'bg-amber/12 text-amber',
  primary: 'bg-primary/15 text-primary',
};

export function Badge({ tone = 'netral', className, children }) {
  return (
    <span className={gabung(
      'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
      GAYA_BADGE[tone], className
    )}>
      {children}
    </span>
  );
}

// ---------- Kartu statistik ----------
const AKSEN = {
  green: 'border-b-green text-green',
  red: 'border-b-red text-red',
  primary: 'border-b-primary text-primary',
  dim: 'border-b-dim text-dim',
  none: 'border-b-line text-ink',
};

export function StatCard({ label, value, sub, tone = 'none' }) {
  const [garis, warna] = AKSEN[tone].split(' ');
  return (
    <div className={gabung('flex-1 min-w-[150px] rounded-xl border border-line bg-bg p-4 border-b-[3px]', garis)}>
      <div className={gabung('text-2xl leading-none font-extrabold tnum', warna)}>{value}</div>
      <div className="mt-2 text-[0.7rem] font-semibold uppercase tracking-wide text-dim">{label}</div>
      {sub && <div className="mt-1 text-xs text-dim">{sub}</div>}
    </div>
  );
}

// ---------- Panel / kartu ----------
export function Panel({ className, children }) {
  return (
    <div className={gabung('rounded-xl border border-line bg-surface overflow-hidden', className)}>
      {children}
    </div>
  );
}

// ---------- Kolom form ----------
export function Field({ label, hint, children, className }) {
  return (
    <div className={className}>
      {label && (
        <label className="mb-1.5 block text-[0.7rem] font-semibold uppercase tracking-wide text-dim">
          {label}
        </label>
      )}
      {children}
      {hint && <p className="mt-1.5 text-xs leading-snug text-dim">{hint}</p>}
    </div>
  );
}

const GAYA_INPUT =
  'w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-sm text-ink outline-none ' +
  'transition-colors placeholder:text-dim/60 ' +
  'focus:border-green focus:ring-3 focus:ring-green/15 disabled:opacity-50';

export function Input({ className, ...rest }) {
  return <input className={gabung(GAYA_INPUT, className)} {...rest} />;
}

export function Select({ className, children, ...rest }) {
  return (
    <select className={gabung(GAYA_INPUT, 'cursor-pointer', className)} {...rest}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...rest }) {
  return <textarea className={gabung(GAYA_INPUT, 'min-h-30 resize-y', className)} {...rest} />;
}

export function Checkbox({ label, className, ...rest }) {
  return (
    <label className={gabung('flex cursor-pointer items-center gap-2 text-sm text-dim select-none', className)}>
      <input type="checkbox" className="size-4 accent-green cursor-pointer" {...rest} />
      {label}
    </label>
  );
}

// ---------- Tabel ----------
export function Table({ children, className }) {
  return (
    <div className={gabung('flex-1 overflow-auto rounded-xl border border-line bg-surface', className)}>
      <table className="w-full border-collapse text-left text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, align = 'left', className, ...rest }) {
  return (
    <th
      className={gabung(
        'sticky top-0 z-1 border-b border-line bg-bg px-4 py-3',
        'text-[0.7rem] font-semibold uppercase tracking-wide text-dim',
        align === 'right' && 'text-right', className
      )}
      {...rest}
    >
      {children}
    </th>
  );
}

export function Td({ children, align = 'left', className, ...rest }) {
  return (
    <td
      className={gabung('border-b border-line px-4 py-3 align-top',
        align === 'right' && 'text-right tnum', className)}
      {...rest}
    >
      {children}
    </td>
  );
}

export function Tr({ children, onClick, className }) {
  return (
    <tr
      onClick={onClick}
      className={gabung(
        'transition-colors last:[&>td]:border-b-0',
        onClick ? 'cursor-pointer hover:bg-primary/8' : 'hover:bg-white/2',
        className
      )}
    >
      {children}
    </tr>
  );
}

// ---------- Keadaan kosong / memuat ----------
export function EmptyState({ title, children, colSpan = 99 }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-6 py-16 text-center text-dim">
        <h3 className="mb-1.5 text-base font-semibold text-ink">{title}</h3>
        {children && <p className="text-sm">{children}</p>}
      </td>
    </tr>
  );
}

export function Spinner({ className }) {
  return (
    <span className={gabung(
      'inline-block size-4 animate-spin rounded-full border-2 border-dim/30 border-t-green',
      className
    )} />
  );
}

// ---------- Bilah judul halaman ----------
export function PageHeader({ title, desc, children }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line bg-surface px-7 py-5">
      <div className="min-w-0">
        <h1 className="text-lg font-bold tracking-tight">{title}</h1>
        {desc && <p className="mt-1 text-sm text-dim">{desc}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

// ---------- Bilah progres ----------
export function ProgressBar({ value, tone = 'green' }) {
  const warna = tone === 'green' ? 'bg-green' : 'bg-primary';
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-bg">
      <div className={gabung('h-full rounded-full transition-[width] duration-300', warna)}
           style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}
