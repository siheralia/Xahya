/** Declarative, side-effect-free plans for persistent equipment creation. */
export type MaterialCreation = { kind: "CREATE_MATERIAL"; material: string; quantity: number };
export type MagicConcentration = { kind: "CONCENTRATE_MAGIC"; amount: number };
export type GrantedProperty =
  | { kind: "DAMAGE_REDUCTION"; target: "ALL" | "PHYSICAL" | "MAGICAL"; multiplier: number }
  | { kind: "NARRATIVE"; description: string };
export type GrantEffect = { kind: "GRANT_EFFECT"; property: GrantedProperty };
export type CreateObject = { kind: "CREATE_OBJECT"; itemType: "WEAPON" | "ARMOR" | "SHIELD" | "OTHER"; name: string; persistent: true };
export type CraftOperation = MaterialCreation | MagicConcentration | GrantEffect | CreateObject;
export type CraftPlan = { operations: CraftOperation[] };
export type CraftedItemBlueprint = {
  name: string;
  itemType: CreateObject["itemType"];
  persistent: true;
  material: string;
  quantity: number;
  magicAmount: number;
  properties: GrantedProperty[];
};
/**
 * Validates and compiles an effect sequence into an item blueprint.
 * Does NOT mint an inventory item or bypass approval, resource debit or equipment limits.
 */
export function compileCraftPlan(plan: CraftPlan): CraftedItemBlueprint {
  if (!Array.isArray(plan.operations) || plan.operations.length < 2 || plan.operations.length > 20) throw new Error("Secuencia inválida");
  let material: MaterialCreation | undefined;
  let magicAmount = 0;
  let creation: CreateObject | undefined;
  const properties: GrantedProperty[] = [];
  for (const [index, op] of plan.operations.entries()) {
    if (creation) throw new Error("Crear objeto debe ser el último efecto");
    switch (op.kind) {
      case "CREATE_MATERIAL":
        if (material || !op.material.trim() || op.material.length > 100 || !Number.isSafeInteger(op.quantity) || op.quantity <= 0) throw new Error("Material inválido");
        material = op;
        break;
      case "CONCENTRATE_MAGIC":
        if (!Number.isSafeInteger(op.amount) || op.amount <= 0 || op.amount > 1000000) throw new Error("Concentración inválida");
        magicAmount += op.amount;
        break;
      case "GRANT_EFFECT":
        if (!material || properties.length >= 12) throw new Error("Propiedad sin material");
        if (op.property.kind === "DAMAGE_REDUCTION") {
          if (!["ALL", "PHYSICAL", "MAGICAL"].includes(op.property.target) || !Number.isFinite(op.property.multiplier) || op.property.multiplier < 0 || op.property.multiplier > 1) throw new Error("Reducción inválida");
        } else if (op.property.kind === "NARRATIVE") {
          if (!op.property.description.trim() || op.property.description.length > 2000) throw new Error("Descripción inválida");
        } else throw new Error("Propiedad desconocida");
        properties.push(op.property);
        break;
      case "CREATE_OBJECT":
        if (index !== plan.operations.length - 1 || !material || !op.persistent || !["WEAPON", "ARMOR", "SHIELD", "OTHER"].includes(op.itemType) || !op.name.trim() || op.name.length > 120) throw new Error("Objeto inválido");
        creation = op;
        break;
      default: throw new Error("Operación desconocida");
    }
  }
  if (!creation || !material) throw new Error("Falta crear material u objeto");
  return { name: creation.name, itemType: creation.itemType, persistent: true, material: material.material, quantity: material.quantity, magicAmount, properties };
}
