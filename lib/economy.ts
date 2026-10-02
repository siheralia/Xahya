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
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(time));
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
    const dbError = error as { message?: unknown; code?: unknown };
    if (String(dbError.message ?? "").includes("unique") || String(dbError.code ?? "") === "P2002") return false;
    return false;
  }
}

export async function processEconomyPayments(now = new Date()) {
  const Business = (db.orm.public as any).Business;
  const Position = (db.orm.public as any).BusinessPosition;
  const Contract = (db.orm.public as any).EmploymentContract;
  const Log = (db.orm.public as any).EconomyPaymentLog;

  const businesses = await Business.all();
  const positions = await Position.all();
  const contracts = await Contract.all();

  let payments = 0;

  // 1. El ingreso pasivo entra primero a la caja del negocio.
  for (const business of businesses) {
    if (!business.active || Number(business.passiveIncome) <= 0) continue;

    const frequency = String(business.passiveFrequency ?? "WEEKLY");
    const p = localParts(now);
    const due = frequency === "DAILY"
      ? dueDaily("00:00", String(business.passiveTime ?? "18:00"), now)
      : p.weekday === Number(business.passiveDayOfWeek ?? 0) &&
        dueDaily("00:00", String(business.passiveTime ?? "18:00"), now);

    if (!due) continue;

    const incomePeriod = periodKey(now, frequency);
    const alreadyCredited = await Log.where({
      paymentType: "BUSINESS_INCOME",
      sourceId: Number(business.id),
      recipientCharacterId: Number(business.ownerCharacterId),
      periodKey: incomePeriod,
    }).first();

    if (!alreadyCredited) {
      await db.transaction(async (tx) => {
        const BusinessTx = (tx.orm.public as any).Business;
        const LogTx = (tx.orm.public as any).EconomyPaymentLog;
        const current = await BusinessTx.where({ id: Number(business.id) }).first();
        if (!current) throw new Error("BUSINESS_MISSING");

        await BusinessTx.where({ id: Number(business.id) }).update({
          balance: Number(current.balance ?? 0) + Number(business.passiveIncome),
        });

        await LogTx.create({
          paymentType: "BUSINESS_INCOME",
          sourceType: "BUSINESS",
          sourceId: Number(business.id),
          recipientCharacterId: Number(business.ownerCharacterId),
          businessId: Number(business.id),
          amount: Number(business.passiveIncome),
          periodKey: incomePeriod,
          description: \`Ingreso pasivo de \${business.name} → caja del negocio\`,
        });
      });
    }
  }

  // 2. Al terminar un turno, el salario sale primero de la caja del negocio.
  // Si no alcanza, el dueño cubre únicamente la diferencia.
  for (const position of positions) {
    const salaryFrequency = String(position.salaryFrequency ?? "DAILY");
    const local = localParts(now);
    const shiftEnded = dueDaily(String(position.startTime), String(position.endTime), now);
    const weeklyDayMatches = local.weekday === Number(position.salaryDayOfWeek ?? 0);

    if (!position.active || !shiftEnded || (salaryFrequency === "WEEKLY" && !weeklyDayMatches)) continue;

    const business = position.businessId
      ? businesses.find((item: any) => Number(item.id) === Number(position.businessId))
      : null;

    const positionContracts = contracts.filter((contract: any) =>
      Number(contract.positionId) === Number(position.id) &&
      contract.active &&
      new Date(contract.startDate).getTime() <= now.getTime() &&
      (!contract.endDate || new Date(contract.endDate).getTime() >= now.getTime())
    );

    for (const contract of positionContracts) {
      const salary = Number(position.salary);
      if (salary <= 0) continue;

      const period = periodKey(now, salaryFrequency, true);
      const existing = await Log.where({
        paymentType: "SALARY",
        sourceId: Number(position.id),
        recipientCharacterId: Number(contract.characterId),
        periodKey: period,
      }).first();
      if (existing) continue;

      try {
        await db.transaction(async (tx) => {
          const BusinessTx = (tx.orm.public as any).Business;
          const ResourceTx = (tx.orm.public as any).CharacterResource;
          const LogTx = (tx.orm.public as any).EconomyPaymentLog;

          let businessPaid = 0;
          if (business) {
            const currentBusiness = await BusinessTx.where({ id: Number(business.id) }).first();
            businessPaid = Math.min(Number(currentBusiness?.balance ?? 0), salary);
            if (businessPaid > 0) {
              await BusinessTx.where({ id: Number(business.id) }).update({
                balance: Number(currentBusiness.balance ?? 0) - businessPaid,
              });
            }
          }

          const remaining = salary - businessPaid;
          if (remaining > 0) {
            const payerId = business
              ? Number(business.ownerCharacterId)
              : (String(position.payerType) === "CHARACTER" && position.payerCharacterId
                  ? Number(position.payerCharacterId)
                  : null);
            if (!payerId) throw new Error("PAYER_MISSING");

            const payer = await ResourceTx.where({ characterId: payerId }).first();
            if (!payer || Number(payer.money) < remaining) throw new Error("PAYER_FUNDS_INSUFFICIENT");

            await ResourceTx.where({ characterId: payerId }).update({
              money: Number(payer.money) - remaining,
            });
          }

          const employee = await ResourceTx.where({ characterId: Number(contract.characterId) }).first();
          if (!employee) throw new Error("RECIPIENT_RESOURCE_MISSING");

          await ResourceTx.where({ characterId: Number(contract.characterId) }).update({
            money: Number(employee.money) + salary,
          });

          await LogTx.create({
            paymentType: "SALARY",
            sourceType: "POSITION",
            sourceId: Number(position.id),
            recipientCharacterId: Number(contract.characterId),
            businessId: position.businessId ? Number(position.businessId) : null,
            amount: salary,
            periodKey: period,
            description: business
              ? \`Salario: \${position.title} (\${business.name})\`
              : \`Salario: \${position.title}\`,
          });
        });
        payments++;
      } catch {
        // Se reintentará cuando haya fondos suficientes.
      }
    }
  }

  // 3. En el cierre del periodo, el dueño recibe únicamente el excedente
  // que quedó en la caja después de los salarios.
  for (const business of businesses) {
    if (!business.active || Number(business.passiveIncome) <= 0) continue;

    const frequency = String(business.passiveFrequency ?? "WEEKLY");
    const p = localParts(now);
    const due = frequency === "DAILY"
      ? dueDaily("00:00", String(business.passiveTime ?? "18:00"), now)
      : p.weekday === Number(business.passiveDayOfWeek ?? 0) &&
        dueDaily("00:00", String(business.passiveTime ?? "18:00"), now);

    if (!due) continue;

    const profitPeriod = periodKey(now, frequency);
    const existingProfit = await Log.where({
      paymentType: "BUSINESS_PROFIT",
      sourceId: Number(business.id),
      recipientCharacterId: Number(business.ownerCharacterId),
      periodKey: profitPeriod,
    }).first();
    if (existingProfit) continue;

    try {
      await db.transaction(async (tx) => {
        const BusinessTx = (tx.orm.public as any).Business;
        const ResourceTx = (tx.orm.public as any).CharacterResource;
        const LogTx = (tx.orm.public as any).EconomyPaymentLog;

        const currentBusiness = await BusinessTx.where({ id: Number(business.id) }).first();
        const profit = Number(currentBusiness?.balance ?? 0);

        if (profit <= 0) {
          await LogTx.create({
            paymentType: "BUSINESS_PROFIT",
            sourceType: "BUSINESS",
            sourceId: Number(business.id),
            recipientCharacterId: Number(business.ownerCharacterId),
            businessId: Number(business.id),
            amount: 0,
            periodKey: profitPeriod,
            description: \`Cierre de ganancias de \${business.name}: sin excedente\`,
          });
          return;
        }

        const owner = await ResourceTx.where({ characterId: Number(business.ownerCharacterId) }).first();
        if (!owner) throw new Error("OWNER_RESOURCE_MISSING");

        await BusinessTx.where({ id: Number(business.id) }).update({ balance: 0 });
        await ResourceTx.where({ characterId: Number(business.ownerCharacterId) }).update({
          money: Number(owner.money) + profit,
        });

        await LogTx.create({
          paymentType: "BUSINESS_PROFIT",
          sourceType: "BUSINESS",
          sourceId: Number(business.id),
          recipientCharacterId: Number(business.ownerCharacterId),
          businessId: Number(business.id),
          amount: profit,
          periodKey: profitPeriod,
          description: \`Ganancia neta de \${business.name} después de salarios\`,
        });
      });
      payments++;
    } catch {
      // Se reintentará en la siguiente ejecución si el cierre no pudo completarse.
    }
  }

  return { payments, checkedAt: now.toISOString() };
}

export { TIME_ZONE, localParts, minutes };
