import postgres from "@prisma/orm-postgres/runtime";
import contractJson from "../prisma/contract.json";

export const db = postgres({
  contractJson,
  url: process.env.DATABASE_URL!,
});