"use client";

import { useMemo } from "react";

type Gender = "masculino" | "femenino" | "indefinido";
type AgeStage = "niño" | "adolescente" | "adulto";

type CharacterSilhouetteProps = {
  age: number;
  gender: Gender;
  height: number;
  className?: string;
};

const STAGE_HEIGHTS: Record<AgeStage, number> = {
  niño: 0.72,
  adolescente: 0.88,
  adulto: 1,
};

function getAgeStage(age: number): AgeStage {
  if (age < 13) return "niño";
  if (age < 18) return "adolescente";
  return "adulto";
}

function getVariant(gender: Gender, stage: AgeStage) {
  return gender + "-" + stage;
}

function Body({
  gender,
  stage,
  fill,
}: {
  gender: Gender;
  stage: AgeStage;
  fill: string;
}) {
  const isChild = stage === "niño";
  const isTeen = stage === "adolescente";
  const isFemale = gender === "femenino";
  const isNeutral = gender === "indefinido";

  const head = isChild ? 17 : isTeen ? 16 : 15;
  const shoulder = isChild ? 25 : isTeen ? (isFemale ? 27 : 31) : (isFemale ? 30 : 36);
  const waist = isChild ? 21 : isTeen ? (isFemale ? 20 : 24) : (isFemale ? 19 : 25);
  const hip = isChild ? 23 : isTeen ? (isFemale ? 27 : 24) : (isFemale ? 29 : 25);
  const torsoTop = 58;
  const torsoBottom = isChild ? 118 : isTeen ? 124 : 130;
  const legGap = isFemale && !isChild ? 6 : 5;
  const legWidth = isChild ? 7 : isTeen ? 8 : 9;
  const armWidth = isChild ? 7 : 8;
  const center = 50;

  const shoulderY = torsoTop + 8;
  const waistY = torsoBottom - 25;
  const hipY = torsoBottom;

  const leftShoulder = center - shoulder / 2;
  const rightShoulder = center + shoulder / 2;
  const leftWaist = center - waist / 2;
  const rightWaist = center + waist / 2;
  const leftHip = center - hip / 2;
  const rightHip = center + hip / 2;

  return (
    <g fill={fill}>
      <circle cx={center} cy={34} r={head} />

      <path
        d={
          "M " + leftShoulder + " " + shoulderY +
          " Q " + center + " " + (torsoTop - 2) + " " + rightShoulder + " " + shoulderY +
          " L " + rightWaist + " " + waistY +
          " Q " + center + " " + (waistY + 5) + " " + leftWaist + " " + waistY +
          " Z"
        }
      />

      {isFemale && !isChild && (
        <path
          d={
            "M " + leftWaist + " " + waistY +
            " Q " + center + " " + (waistY + 4) + " " + rightWaist + " " + waistY +
            " L " + rightHip + " " + hipY +
            " Q " + center + " " + (hipY + 5) + " " + leftHip + " " + hipY +
            " Z"
          }
        />
      )}

      {isNeutral && !isChild && (
        <path
          d={
            "M " + leftWaist + " " + waistY +
            " L " + leftHip + " " + hipY +
            " L " + rightHip + " " + hipY +
            " L " + rightWaist + " " + waistY + " Z"
          }
        />
      )}

      <rect
        x={leftShoulder - armWidth / 2}
        y={shoulderY - 2}
        width={armWidth}
        height={torsoBottom - shoulderY + 18}
        rx={armWidth / 2}
        transform={"rotate(" + (isChild ? 3 : 5) + " " + leftShoulder + " " + shoulderY + ")"}
      />
      <rect
        x={rightShoulder - armWidth / 2}
        y={shoulderY - 2}
        width={armWidth}
        height={torsoBottom - shoulderY + 18}
        rx={armWidth / 2}
        transform={"rotate(" + (isChild ? -3 : -5) + " " + rightShoulder + " " + shoulderY + ")"}
      />

      <rect
        x={leftHip + (hip - legGap) / 2 - legWidth}
        y={hipY - 1}
        width={legWidth}
        height={isChild ? 55 : isTeen ? 66 : 76}
        rx={legWidth / 2}
      />
      <rect
        x={rightHip - (hip - legGap) / 2}
        y={hipY - 1}
        width={legWidth}
        height={isChild ? 55 : isTeen ? 66 : 76}
        rx={legWidth / 2}
      />
    </g>
  );
}

export function CharacterSilhouette({
  age,
  gender,
  height,
  className = "",
}: CharacterSilhouetteProps) {
  const stage = getAgeStage(age);
  const variant = useMemo(() => getVariant(gender, stage), [gender, stage]);

  const scale = Math.max(0.55, Math.min(1.08, height / 180));
  const variantLabel =
    gender === "masculino"
      ? "Masculina"
      : gender === "femenino"
        ? "Femenina"
        : "Indefinida";

  return (
    <div className={"flex flex-col items-center " + className}>
      <div className="flex h-[250px] w-full items-end justify-center overflow-hidden">
        <svg
          viewBox="0 0 100 220"
          className="h-[220px] w-auto origin-bottom"
          style={{ transform: "scale(" + scale + ")" }}
          role="img"
          aria-label={"Silueta " + variantLabel + ", etapa " + stage + ", " + height + " cm"}
          data-silhouette={variant}
        >
          <line x1="50" y1="207" x2="50" y2="212" stroke="rgb(63 63 70)" strokeWidth="1" />
          <ellipse cx="50" cy="212" rx="31" ry="3" fill="rgb(39 39 42)" />
          <Body gender={gender} stage={stage} fill="rgb(161 161 170)" />
        </svg>
      </div>

      <div className="mt-2 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
          {variantLabel}
        </p>
        <p className="mt-1 text-sm text-zinc-400">
          {stage} · {height} cm
        </p>
      </div>
    </div>
  );
}
