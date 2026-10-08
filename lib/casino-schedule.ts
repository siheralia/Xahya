import { db } from "@/lib/db";
import { localParts } from "@/lib/economy";
import { CASINO_SETS, getCasinoSet, type CasinoSet } from "@/lib/casino";

export type CasinoSchedule = {
  id: string;
  setId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  active: boolean;
};

function parseDetails(log: { details?: unknown }) {
  try {
    return typeof log.details === "string" ? JSON.parse(log.details) : (log.details ?? {});
  } catch {
    return {};
  }
}

export async function getAllCasinoSets(): Promise<CasinoSet[]> {
  const logs = await db.orm.public.AuditLog.where({ action: "CASINO_SET" }).all();
  const deletedLogs = await db.orm.public.AuditLog.where({ action: "CASINO_SET_DELETE" }).all();
  const deletedIds = new Set(
    deletedLogs.map((log) => parseDetails(log)?.setId)
      .filter((id): id is string => typeof id === "string"),
  );
  const latestById = new Map<string, { createdAt: string; set: CasinoSet }>();

  for (const log of logs) {
    const details = parseDetails(log);
    const set = details?.set as CasinoSet | undefined;
    if (!set?.id || !Array.isArray(set.segments) || deletedIds.has(set.id)) continue;
    const createdAt = String(log.createdAt);
    const previous = latestById.get(set.id);
    if (!previous || createdAt > previous.createdAt) latestById.set(set.id, { createdAt, set });
  }

  const saved = [...latestById.values()].map((entry) => entry.set);
  const savedById = new Map(saved.map((set) => [set.id, set]));
  return CASINO_SETS.map((set) => savedById.get(set.id) ?? set).concat(
    saved.filter((set) => !CASINO_SETS.some((base) => base.id === set.id)),
  );
}

export async function getCasinoSchedules(): Promise<CasinoSchedule[]> {
  const logs = await db.orm.public.AuditLog.where({ action: "CASINO_SCHEDULE_CONFIG" }).all();
  const latest = logs.map((log) => ({
    createdAt: String(log.createdAt),
    details: parseDetails(log),
  })).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const schedules = latest?.details?.schedules;
  return Array.isArray(schedules) ? schedules as CasinoSchedule[] : [];
}

async function getManualActiveSet(sets: CasinoSet[]): Promise<CasinoSet> {
  const logs = await db.orm.public.AuditLog.where({ action: "CASINO_CONFIG" }).all();
  const latest = logs.map((log) => ({
    createdAt: String(log.createdAt),
    details: parseDetails(log),
  })).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const snapshot = latest?.details?.set as CasinoSet | undefined;
  if (snapshot?.id && Array.isArray(snapshot.segments)) {
    return sets.find((set) => set.id === snapshot.id) ?? snapshot;
  }
  return sets.find((set) => set.id === latest?.details?.setId)
    ?? getCasinoSet(latest?.details?.setId);
}

export async function getActiveCasinoSet(): Promise<{ set: CasinoSet; schedule: CasinoSchedule | null }> {
  const [sets, schedules] = await Promise.all([getAllCasinoSets(), getCasinoSchedules()]);
  const p = localParts();
  const nowMinutes = p.hour * 60 + p.minute;
  const timeValue = (value: string) => {
    const match = /^(\d{2}):(\d{2})$/.exec(value);
    return match ? Number(match[1]) * 60 + Number(match[2]) : -1;
  };
  const schedule = schedules.find((entry) =>
    entry.active &&
    (entry.dayOfWeek === -1 || entry.dayOfWeek === p.weekday) &&
    nowMinutes >= timeValue(entry.startTime) &&
    nowMinutes < timeValue(entry.endTime),
  ) ?? null;
  if (schedule) {
    const set = sets.find((entry) => entry.id === schedule.setId);
    if (set) return { set, schedule };
  }
  return { set: await getManualActiveSet(sets), schedule: null };
}

export function validateCasinoSchedules(input: unknown, validSetIds: Set<string>):
  { schedules?: CasinoSchedule[]; error?: string } {
  if (!Array.isArray(input)) return { error: "La programación debe ser una lista." };
  if (input.length > 100) return { error: "No puedes guardar más de 100 horarios." };

  const schedules: CasinoSchedule[] = [];
  for (const item of input) {
    const id = String(item?.id ?? "").trim();
    const setId = String(item?.setId ?? "").trim();
    const dayOfWeek = Number(item?.dayOfWeek);
    const startTime = String(item?.startTime ?? "");
    const endTime = String(item?.endTime ?? "");
    const active = item?.active !== false;
    const time = (value: string) => {
      const match = /^(\d{2}):(\d{2})$/.exec(value);
      if (!match) return -1;
      const hour = Number(match[1]);
      const minute = Number(match[2]);
      return hour <= 23 && minute <= 59 ? hour * 60 + minute : -1;
    };
    const start = time(startTime);
    const end = time(endTime);
    if (!id || !validSetIds.has(setId) || !Number.isInteger(dayOfWeek) || dayOfWeek < -1 || dayOfWeek > 6 || start < 0 || end <= start) {
      return { error: "Cada horario necesita un set válido, día y horas correctas; la hora final debe ser posterior a la inicial." };
    }
    schedules.push({ id, setId, dayOfWeek, startTime, endTime, active });
  }

  const activeSchedules = schedules.filter((entry) => entry.active);
  for (let i = 0; i < activeSchedules.length; i += 1) {
    const a = activeSchedules[i];
    const aStart = timeToMinutes(a.startTime);
    const aEnd = timeToMinutes(a.endTime);
    for (let j = i + 1; j < activeSchedules.length; j += 1) {
      const b = activeSchedules[j];
      if (a.dayOfWeek !== -1 && b.dayOfWeek !== -1 && a.dayOfWeek !== b.dayOfWeek) continue;
      const bStart = timeToMinutes(b.startTime);
      const bEnd = timeToMinutes(b.endTime);
      if (aStart < bEnd && bStart < aEnd) {
        return { error: "Hay horarios que se solapan. Cada día solo puede tener un set de ruleta activo a la vez." };
      }
    }
  }
  return { schedules };
}

function timeToMinutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}
