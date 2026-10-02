import { db } from "@/lib/db";

const TIME_ZONE = "America/Chihuahua";

function localParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "0";
  const weekday = ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as Record<string, number>)[get("weekday")] ?? 0;
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    weekday,
  };
}

function minutes(time: string) {
  const match = /^(\\d{1,2}):(\\d{2})$/.exec(String(time));
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

function periodKey(date: Date, frequency: string, endOfShift = false) {
  const p = localParts(date);
  const day = `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  if (frequency === "WEEKLY") {
    return `${p.year}-W${String(weekNumber(date)).padStart(2, "0")}`;
  }
  return endOfShift ? day + "-shift" : day;
}

function weekNumber(date: Date) {
  const p = localParts(date);
  const jan4 = new Date(Date.UTC(p.year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1);
  const current = new Date(Date.UTC(p.year, p.month - 1, p.day));
  return Math.ceil(((current.getTime() - monday.getTime()) / 86400000 + 1) / 7);
}

function dueDaily(startTime: string, endTime: string, date = new Date()) {
  const p = localParts(date);
  const start = minutes(startTime);
  const end = minutes(endTime);
  if (start === null || end === null) return false;
  return p.hour * 60 + p.minute >= end;
}

async function payCharacter({
  paymentType,
  sourceType,
  sourceId,
  recipientCharacterId,
  amount,
  period,
  description,
  businessId,
  payerCharacterId,
}: {
  paymentType: string;
  sourceType: string;
  sourceId: number;
  recipientCharacterId: number;
  amount: number;
  period: string;
  description: string;
  businessId?: number | null;
  payerCharacterId?: number | null;
}) {
  if (amount <= 0) return false;

  try {
    await db.transaction(async (tx) => {
      const Log = (tx.orm.public as any).EconomyPaymentLog;
      const Resource = (tx.orm.public as any).CharacterResource;

      await Log.create({
        paymentType,
        sourceType,
        sourceId,
        recipientCharacterId,
        businessId: businessId ?? null,
        amount,
        periodKey: period,
        description,
      });

      const recipient = await Resource.where({ characterId: recipientCharacterId }).first();
      if (!recipient) throw new Error("RECIPIENT_RESOURCE_MISSING");

      if (payerCharacterId) {
        const payer = await Resource.where({ characterId: payerCharacterId }).first();
        if (!payer || Number(payer.money) < amount) throw new Error("PAYER_FUNDS_INSUFFICIENT");
        await Resource.where({ characterId: payerCharacterId }).update({ money: Number(payer.money) - amount });
      }

      await Resource.where({ characterId: recipientCharacterId }).update({ money: Number(recipient.money) + amount });
    });
    return true;
  } catch (error) {
    if (String((error as Error)?.message ?? "").includes("unique") || String((error as Error)?.code ?? "") === "P2002") return false;
    return false;
  }
}

export async function processEconomyPayments(now = new Date()) {
  const Business = (db.orm.public as any).Business;
  const Position = (db.orm.public as any).BusinessPosition;
  const Contract = (db.orm.public as any).EmploymentContract;

  const businesses = await Business.all();
  const positions = await Position.all();
  const contracts = await Contract.all();

  let payments = 0;

  for (const business of businesses) {
    if (!business.active) continue;
    const frequency = String(business.passiveFrequency ?? "WEEKLY");
    const p = localParts(now);
    const due = frequency === "DAILY"
      ? dueDaily("00:00", String(business.passiveTime ?? "18:00"), now)
      : p.weekday === Number(business.passiveDayOfWeek ?? 0) && dueDaily("00:00", String(business.passiveTime ?? "18:00"), now);

    if (due && Number(business.passiveIncome) > 0) {
      const paid = await payCharacter({
        paymentType: "BUSINESS_PROFIT",
        sourceType: "BUSINESS",
        sourceId: Number(business.id),
        recipientCharacterId: Number(business.ownerCharacterId),
        amount: Number(business.passiveIncome),
        period: periodKey(now, frequency),
        description: `Ganancia pasiva de ${business.name}`,
        businessId: Number(business.id),
      });
      if (paid) payments++;
    }
  }

  for (const position of positions) {
    if (!position.active || !dueDaily(String(position.startTime), String(position.endTime), now)) continue;
    const positionContracts = contracts.filter((contract: any) =>
      Number(contract.positionId) === Number(position.id) &&
      contract.active &&
      new Date(contract.startDate).getTime() <= now.getTime() &&
      (!contract.endDate || new Date(contract.endDate).getTime() >= now.getTime())
    );

    for (const contract of positionContracts) {
      const frequency = String(position.salaryFrequency ?? "DAILY");
      const paid = await payCharacter({
        paymentType: "SALARY",
        sourceType: "POSITION",
        sourceId: Number(position.id),
        recipientCharacterId: Number(contract.characterId),
        amount: Number(position.salary),
        period: periodKey(now, frequency, true),
        description: `Salario: ${position.title}`,
        businessId: Number(position.businessId),
        payerCharacterId: String(position.payerType) === "CHARACTER" && position.payerCharacterId ? Number(position.payerCharacterId) : null,
      });
      if (paid) payments++;
    }
  }

  return { payments, checkedAt: now.toISOString() };
}

export { TIME_ZONE, localParts, minutes };
