// Sesi login sederhana: satu akun tetap yang diambil dari .env.local.
// Token = base64url(payload) + "." + base64url(HMAC-SHA256(payload)).
// Sengaja hanya memakai Web Crypto supaya jalan di proxy (edge) maupun
// route handler (node) tanpa dependensi tambahan.

export const NAMA_COOKIE = 'bpab_sesi';
export const UMUR_SESI = 60 * 60 * 24 * 7; // detik — 7 hari

const enc = new TextEncoder();

const b64u = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const dariB64u = (s) => {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  s += '='.repeat((4 - (s.length % 4)) % 4);
  return atob(s);
};

async function tandaTangan(payload, secret) {
  const kunci = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  return b64u(await crypto.subtle.sign('HMAC', kunci, enc.encode(payload)));
}

// Bandingkan dua string tanpa berhenti di karakter pertama yang beda,
// supaya lama pengecekan tidak membocorkan seberapa banyak yang cocok.
export function samaWaktuTetap(a, b) {
  a = String(a); b = String(b);
  let beda = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    beda |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return beda === 0;
}

// null bila salah satu variabel belum diisi → login ditolak (fail closed).
export function konfigAuth() {
  const user = process.env.AUTH_USER;
  const pass = process.env.AUTH_PASS;
  const secret = process.env.AUTH_SECRET;
  if (!user || !pass || !secret) return null;
  return { user, pass, secret };
}

export async function buatToken(username, secret) {
  const payload = b64u(enc.encode(JSON.stringify({
    u: username,
    exp: Date.now() + UMUR_SESI * 1000,
  })));
  return `${payload}.${await tandaTangan(payload, secret)}`;
}

export async function cekToken(token, secret) {
  if (!token || !secret) return false;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return false;
  const harap = await tandaTangan(payload, secret);
  if (!samaWaktuTetap(sig, harap)) return false;
  try {
    const d = JSON.parse(dariB64u(payload));
    return typeof d.exp === 'number' && d.exp > Date.now();
  } catch {
    return false;
  }
}
