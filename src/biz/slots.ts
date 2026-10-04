import { DateTime } from "luxon";
import type { Appointment, Block, Catalogue, ID, Slot } from "./backend/types";

/**
 * Same rules as public.available_slots() in the database:
 * working hours − breaks − blocked time − active appointments (incl. buffer),
 * on the business's slot step, after the lead time and within 90 days.
 */
export function computeSlots(
  cat: Catalogue,
  appts: Appointment[],
  blocks: Block[],
  q: { serviceId: ID; day: string; professionalId?: ID | null; excludeId?: ID },
  now = new Date(),
): Slot[] {
  const b = cat.business;
  const s = cat.services.find((x) => x.id === q.serviceId && x.active);
  if (!s) return [];
  const day = DateTime.fromISO(q.day, { zone: b.timezone }).startOf("day");
  if (!day.isValid) return [];
  const wd = day.weekday % 7;
  const at = (min: number) => day.plus({ minutes: min }).toMillis();
  const need = (s.duration_min + s.buffer_min) * 60_000;
  const step = b.slot_step_min * 60_000;
  const earliest = now.getTime() + b.lead_min * 60_000;
  const latest = now.getTime() + 90 * 86_400_000;
  const out: Slot[] = [];
  for (const p of cat.professionals) {
    if (!p.active || !p.service_ids.includes(s.id) || (q.professionalId && p.id !== q.professionalId)) continue;
    const busy: [number, number][] = [
      ...p.breaks.filter((r) => r.weekday === wd).map((r) => [at(r.start_min), at(r.end_min)] as [number, number]),
      ...blocks.filter((x) => x.professional_id === p.id).map((x) => [Date.parse(x.starts_at), Date.parse(x.ends_at)] as [number, number]),
      ...appts
        .filter((a) => a.professional_id === p.id && (a.status === "pending" || a.status === "confirmed") && a.id !== q.excludeId)
        .map((a) => [Date.parse(a.starts_at), Date.parse(a.ends_at) + a.buffer_min * 60_000] as [number, number]),
    ];
    for (const w of p.hours.filter((r) => r.weekday === wd)) {
      for (let t = at(w.start_min); t + need <= at(w.end_min); t += step) {
        if (t < earliest || t > latest) continue;
        if (busy.some(([bs, be]) => t < be && bs < t + need)) continue;
        out.push({ starts_at: new Date(t).toISOString(), professional_id: p.id });
      }
    }
  }
  return out.sort((x, y) => x.starts_at.localeCompare(y.starts_at) || x.professional_id.localeCompare(y.professional_id));
}

/** Israeli mobile numbers → E.164 (+9725XXXXXXXX). Returns null when invalid. */
export function toE164(input: string): string | null {
  const d = input.replace(/[^\d+]/g, "");
  if (/^\+9725\d{8}$/.test(d)) return d;
  if (/^9725\d{8}$/.test(d)) return `+${d}`;
  if (/^05\d{8}$/.test(d)) return `+972${d.slice(1)}`;
  if (/^\+\d{9,15}$/.test(d)) return d;
  return null;
}

export const displayPhone = (p: string) => {
  const m = p.match(/^\+9725(\d)(\d{3})(\d{4})$/);
  return m ? `05${m[1]}-${m[2]}${m[3]}` : p;
};
