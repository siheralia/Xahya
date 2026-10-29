import { salaryRest } from "@/lib/role-salary";

const TIME_ZONE = "America/Chihuahua";
function dayInChihuahua(date: Date) {
 const parts = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
 }).formatToParts(date);
 const part = (key: string) => parts.find(item => item.type === key)?.value ?? "";
 return `${part("year")}-${part("month")}-${part("day")}`;
}
/**
 * Credit each local calendar day exactly once per assigned role.
 * The SQL function uses unique (user, role, day) keys and updates balances atomically.
 * Only the authenticated CRON_SECRET endpoint should call this function.
 */
export async function processRoleSalaryAccrual(now = new Date()) {
 const day = dayInChihuahua(now);
 const creditedUsers = await salaryRest("rpc/accrue_role_salary", {
  method: "POST", body: JSON.stringify({ p_day: day }),
 });
 return { day, creditedUsers };
}
