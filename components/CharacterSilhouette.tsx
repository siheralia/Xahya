"use client";

type Gender = "masculino" | "femenino" | "indefinido";
type AgeStage = "niño" | "adolescente" | "adulto";

type CharacterSilhouetteProps = {
  age: number;
  gender: Gender;
  height: number;
  className?: string;
};

function getAgeStage(age: number): AgeStage {
  if (age < 13) return "niño";
  if (age < 18) return "adolescente";
  return "adulto";
}

function Body({ gender, stage, fill }: { gender: Gender; stage: AgeStage; fill: string }) {
  const child = stage === "niño";
  const teen = stage === "adolescente";
  const female = gender === "femenino";
  const neutral = gender === "indefinido";

  const head = child ? 15 : teen ? 14 : 13;
  const neck = child ? 5 : 6;
  const shoulder = child ? 23 : teen ? (female ? 27 : 31) : (female ? 30 : 36);
  const waist = child ? 19 : teen ? (female ? 19 : 23) : (female ? 18 : 24);
  const hip = child ? 22 : teen ? (female ? 27 : 24) : (female ? 30 : 25);
  const torso = child ? 53 : teen ? 61 : 68;
  const leg = child ? 48 : teen ? 61 : 72;
  const arm = child ? 47 : teen ? 57 : 65;
  const cx = 100;
  const headY = 27;
  const shoulderY = 58;
  const waistY = shoulderY + torso * 0.63;
  const hipY = shoulderY + torso;
  const footY = hipY + leg;
  const armW = child ? 7 : 8;
  const legW = child ? 9 : 10;

  return (
    <g fill={fill}>
      <circle cx={cx} cy={headY} r={head} />
      <path d={"M " + (cx-neck) + " 40 L " + (cx+neck) + " 40 L " + (cx+neck-1) + " " + shoulderY + " L " + (cx-neck+1) + " " + shoulderY + " Z"} />
      <path d={
        "M " + (cx-shoulder/2) + " " + shoulderY +
        " C " + (cx-shoulder*0.34) + " " + (shoulderY-4) + " " + (cx-shoulder*0.22) + " " + (shoulderY-2) + " " + (cx-waist/2) + " " + waistY +
        " C " + (cx-waist*0.36) + " " + (waistY+7) + " " + (cx-hip/2) + " " + (hipY-3) + " " + (cx-hip/2) + " " + hipY +
        " L " + (cx+hip/2) + " " + hipY +
        " C " + (cx+hip/2) + " " + (hipY-3) + " " + (cx+waist*0.36) + " " + (waistY+7) + " " + (cx+waist/2) + " " + waistY +
        " C " + (cx+shoulder*0.22) + " " + (shoulderY-2) + " " + (cx+shoulder*0.34) + " " + (shoulderY-4) + " " + (cx+shoulder/2) + " " + shoulderY +
        " Z"
      } />
      <ellipse cx={cx} cy={waistY + 5} rx={female && !child ? waist * 0.42 : waist * 0.45} ry={child ? 6 : 7} />
      <rect x={cx-shoulder/2-armW/2} y={shoulderY-1} width={armW} height={arm} rx={armW/2} transform={"rotate(5 " + (cx-shoulder/2) + " " + shoulderY + ")"} />
      <rect x={cx+shoulder/2-armW/2} y={shoulderY-1} width={armW} height={arm} rx={armW/2} transform={"rotate(-5 " + (cx+shoulder/2) + " " + shoulderY + ")"} />
      <circle cx={cx-shoulder/2-4} cy={shoulderY+arm-2} r={child ? 3.5 : 4} />
      <circle cx={cx+shoulder/2+4} cy={shoulderY+arm-2} r={child ? 3.5 : 4} />
      <path d={"M " + (cx-hip/2+2) + " " + hipY + " C " + (cx-hip/4) + " " + (hipY+2) + " " + (cx-7) + " " + (hipY+8) + " " + (cx-6) + " " + (hipY+10) + " L " + (cx-6) + " " + footY + " L " + (cx-15) + " " + footY + " Q " + (cx-19) + " " + (footY+1) + " " + (cx-18) + " " + (footY+5) + " L " + (cx-4) + " " + (footY+5) + " L " + (cx-4) + " " + (hipY+10) + " C " + (cx-4) + " " + (hipY+5) + " " + (cx-8) + " " + (hipY+2) + " " + (cx-hip/2+2) + " " + hipY + " Z"} />
      <path d={"M " + (cx+hip/2-2) + " " + hipY + " C " + (cx+hip/4) + " " + (hipY+2) + " " + (cx+7) + " " + (hipY+8) + " " + (cx+6) + " " + (hipY+10) + " L " + (cx+6) + " " + footY + " L " + (cx+15) + " " + footY + " Q " + (cx+19) + " " + (footY+1) + " " + (cx+18) + " " + (footY+5) + " L " + (cx+4) + " " + (footY+5) + " L " + (cx+4) + " " + (hipY+10) + " C " + (cx+4) + " " + (hipY+5) + " " + (cx+8) + " " + (hipY+2) + " " + (cx+hip/2-2) + " " + hipY + " Z"} />
    </g>
  );
}

export function CharacterSilhouette({ age, gender, height, className = "" }: CharacterSilhouetteProps) {
  const stage = getAgeStage(age);
  const normalizedGender = String(gender).trim().toLowerCase() as Gender;
  const safeGender: Gender = normalizedGender === "masculino" || normalizedGender === "femenino" ? normalizedGender : "indefinido";
  const variant = safeGender + "-" + stage;
  const scale = Math.max(0.55, Math.min(1.08, height / 180));
  const label = safeGender === "masculino" ? "Masculina" : safeGender === "femenino" ? "Femenina" : "Indefinida";

  return (
    <div className={"flex flex-col items-center " + className}>
      <div className="flex h-[280px] w-full items-end justify-center overflow-hidden">
        <svg viewBox="0 0 200 230" className="h-[235px] w-auto origin-bottom" style={{ transform: "scale(" + scale + ")" }} role="img" aria-label={"Silueta " + label + ", etapa " + stage + ", " + height + " cm"} data-silhouette={variant}>
          <line x1="100" y1="205" x2="100" y2="213" stroke="rgb(63 63 70)" strokeWidth="1" />
          <ellipse cx="100" cy="214" rx="48" ry="4" fill="rgb(39 39 42)" />
          <Body gender={safeGender} stage={stage} fill="rgb(161 161 170)" />
        </svg>
      </div>
      <div className="mt-2 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">{label}</p>
        <p className="mt-1 text-sm text-zinc-400">{stage} · {height} cm</p>
      </div>
    </div>
  );
}
