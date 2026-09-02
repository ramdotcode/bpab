'use client';
import { useState } from 'react';
import { Button, Field, Input, Spinner } from '@/components/ui';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [galat, setGalat] = useState('');
  const [sibuk, setSibuk] = useState(false);

  const masuk = async (e) => {
    e.preventDefault();
    setGalat('');
    setSibuk(true);
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) {
        setGalat(j.message || 'Gagal masuk.');
        setSibuk(false);
        return;
      }
      // Kembali ke halaman yang tadinya dituju (hanya path internal).
      const next = new URLSearchParams(window.location.search).get('next');
      const tujuan = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
      window.location.replace(tujuan);
    } catch {
      setGalat('Tidak bisa menghubungi server.');
      setSibuk(false);
    }
  };

  return (
    <div className="grid flex-1 place-items-center overflow-y-auto p-6">
      <form onSubmit={masuk}
        className="fade-in w-full max-w-sm rounded-2xl border border-line bg-surface p-7 shadow-2xl shadow-black/40">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-gradient-to-br from-green to-emerald-400 shadow-lg shadow-green/25">
            <svg viewBox="0 0 24 24" className="size-5 fill-white">
              <path d="M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </span>
          <div>
            <div className="text-lg font-extrabold tracking-tight">
              BPAB <span className="text-green">RW 18</span>
            </div>
            <div className="text-xs text-dim">Masuk untuk melanjutkan</div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <Field label="Username">
            <Input name="username" autoComplete="username" autoFocus required
              value={username} onChange={(e) => setUsername(e.target.value)} />
          </Field>
          <Field label="Password">
            <Input name="password" type="password" autoComplete="current-password" required
              value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>

          {galat && (
            <p role="alert" className="rounded-lg border border-red/30 bg-red/10 px-3 py-2 text-sm text-red">
              {galat}
            </p>
          )}

          <Button type="submit" variant="green" disabled={sibuk} className="mt-1 w-full">
            {sibuk ? <><Spinner className="border-t-white" /> Memeriksa...</> : 'Masuk'}
          </Button>
        </div>
      </form>
    </div>
  );
}
