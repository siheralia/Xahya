import { describe, expect, it } from "vitest";
import { applyRangePch, rangePchAdjustment } from "../lib/skills/range-pricing";
describe("skill range pricing",()=>{
  it("keeps five metres neutral",()=>expect(applyRangePch(10,5)).toBe(10));
  it("discounts shorter ranges",()=>expect(applyRangePch(10,2)).toBe(7));
  it("charges longer ranges",()=>expect(applyRangePch(10,8)).toBe(13));
  it("never discounts below one PCH",()=>expect(applyRangePch(2,1)).toBe(1));
  it("rejects invalid ranges",()=>{for(const n of [0,101,1.5,NaN,Infinity])expect(()=>rangePchAdjustment(n)).toThrow();});
});
