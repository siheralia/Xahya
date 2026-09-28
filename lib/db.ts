import { Temporal } from "@js-temporal/polyfill";

(globalThis as any).Temporal = Temporal;

import postgres from "@prisma/orm-postgres/runtime";
import type { Contract } from "../prisma/contract.d";
import contractJson from "../prisma/contract.json";

export const db = postgres<Contract>({
  contractJson,
  url: process.env.DATABASE_URL!,
});