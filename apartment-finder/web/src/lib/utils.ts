import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function shekels(n: number | null | undefined): string {
  return n == null ? '—' : `₪${n.toLocaleString('en-US')}`;
}

/** Only http(s) URLs are allowed to become links — manual:// entries are not. */
export function safeUrl(url: string | null | undefined): string | null {
  return /^https?:\/\//i.test(url || '') ? (url as string) : null;
}

/** Local display form for an E.164 Israeli number: +972501234567 -> 050-123-4567. */
export function localPhone(phone: string | null | undefined): string {
  if (!phone || !phone.startsWith('+972')) return phone || '';
  const local = '0' + phone.slice(4);
  return local.length === 10 ? `${local.slice(0, 3)}-${local.slice(3, 6)}-${local.slice(6)}` : local;
}

export function waLink(phone: string | null | undefined): string | null {
  if (!phone || !/^\+\d{8,15}$/.test(phone)) return null;
  return `https://wa.me/${phone.slice(1)}`;
}

/** "2h ago", "3d ago" — coarse on purpose, this is a glance-value not a clock. */
export function relativeTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  return `${months}mo ago`;
}

export function scoreTier(score: number): 'high' | 'mid' | 'low' {
  return score >= 70 ? 'high' : score >= 50 ? 'mid' : 'low';
}
