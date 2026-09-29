export const EQUIPMENT_SLOTS = [
  "MAIN_HAND",
  "OFF_HAND",
  "HEAD",
  "BODY",
  "FEET",
  "ARMS",
  "BACK",
  "ACCESSORY_1",
  "ACCESSORY_2",
] as const;

export type EquipmentSlot = (typeof EQUIPMENT_SLOTS)[number];

export const EQUIPMENT_SLOT_LABELS: Record<EquipmentSlot, string> = {
  MAIN_HAND: "Mano principal",
  OFF_HAND: "Mano secundaria",
  HEAD: "Cabeza",
  BODY: "Cuerpo",
  FEET: "Pies",
  ARMS: "Brazos",
  BACK: "Espalda",
  ACCESSORY_1: "Accesorio 1",
  ACCESSORY_2: "Accesorio 2",
};

export function isEquipmentSlot(value: unknown): value is EquipmentSlot {
  return EQUIPMENT_SLOTS.includes(value as EquipmentSlot);
}
