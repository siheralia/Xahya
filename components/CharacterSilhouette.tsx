"use client";

type Gender = "masculino" | "femenino" | "indefinido";
type AgeStage = "niño" | "adolescente" | "adulto";

function getAgeStage(age: number): AgeStage {
  if (age < 13) return "niño";
  if (age < 18) return "adolescente";
  return "adulto";
}

function normalizeGender(gender: string): Gender {
  const value = String(gender).trim().toLowerCase();
  return value === "masculino" || value === "femenino" ? value : "indefinido";
}

type SilhouetteOptions = {
  gender: Gender;
  stage: AgeStage;
  color?: string;
  opacity?: number;
};

function SilhouetteFigure({ gender, stage, fill }: { gender: Gender; stage: AgeStage; fill: string }) {
  const child = stage === "niño";
  const teen = stage === "adolescente";
  const female = gender === "femenino";
  const neutral = gender === "indefinido";

  const headR = child ? 18 : teen ? 16 : 15;
  const headY = 30;
  const shoulder = child ? 36 : teen ? (female ? 43 : 48) : (female ? 48 : 56);
  const waist = child ? 29 : teen ? (female ? 28 : 36) : (female ? 29 : 39);
  const hip = child ? 34 : teen ? (female ? 40 : 36) : (female ? 47 : 39);
  const shoulderY = 61;
  const waistY = child ? 99 : 108;
  const hipY = child ? 117 : 132;
  const legBottom = child ? 205 : teen ? 222 : 236;
  const armBottom = child ? 124 : teen ? 145 : 158;

  return (
    <g fill={fill}>
      <circle cx="100" cy={headY} r={headR} />

      {female && !child ? (
        <>
          <path d="M82 31 C81 17 90 9 101 10 C114 10 121 19 119 35 C114 27 108 23 100 24 C94 25 88 28 82 31Z" />
          <path d={"M" + (100 - shoulder / 2) + " " + shoulderY +
            " C" + (100 - shoulder * 0.38) + " 56 " + (100 - waist / 2) + " 79 " + (100 - waist / 2) + " " + waistY +
            " L" + (100 - hip / 2) + " " + hipY +
            " L" + (100 + hip / 2) + " " + hipY +
            " L" + (100 + waist / 2) + " " + waistY +
            " C" + (100 + waist / 2) + " 79 " + (100 + shoulder * 0.38) + " 56 " + (100 + shoulder / 2) + " " + shoulderY + " Z"} />
          <path d={"M" + (100 - hip / 2) + " " + hipY +
            " L" + (100 - 14) + " " + legBottom +
            " L" + (100 - 5) + " " + legBottom +
            " L" + (100 - 3) + " " + (hipY + 7) +
            " L" + (100 + 3) + " " + (hipY + 7) +
            " L" + (100 + 5) + " " + legBottom +
            " L" + (100 + 14) + " " + legBottom +
            " L" + (100 + hip / 2) + " " + hipY + " Z"} />
        </>
      ) : (
        <>
          <path d={"M" + (100 - shoulder / 2) + " " + shoulderY +
            " C" + (100 - shoulder * 0.36) + " 57 " + (100 - waist / 2) + " 84 " + (100 - waist / 2) + " " + waistY +
            " L" + (100 - hip / 2) + " " + hipY +
            " L" + (100 + hip / 2) + " " + hipY +
            " L" + (100 + waist / 2) + " " + waistY +
            " C" + (100 + waist / 2) + " 84 " + (100 + shoulder * 0.36) + " 57 " + (100 + shoulder / 2) + " " + shoulderY + " Z"} />
          {neutral && !child && <path d={"M" + (100 - 3) + " " + hipY + " L" + (100 - 11) + " " + legBottom + " L" + (100 - 3) + " " + legBottom + " L100 " + (hipY + 14) + " L" + (100 + 3) + " " + legBottom + " L" + (100 + 11) + " " + legBottom + " L" + (100 + 3) + " " + hipY + " Z"} />}
          {!neutral && <path d={"M" + (100 - hip / 2 + 3) + " " + hipY +
            " L" + (100 - 12) + " " + legBottom +
            " L" + (100 - 3) + " " + legBottom +
            " L" + (100 - 3) + " " + (hipY + 9) +
            " L" + (100 + 3) + " " + (hipY + 9) +
            " L" + (100 + 3) + " " + legBottom +
            " L" + (100 + 12) + " " + legBottom +
            " L" + (100 + hip / 2 - 3) + " " + hipY + " Z"} />}
        </>
      )}

      {child && female ? (
        <>
          <circle cx="84" cy="30" r="8" />
          <circle cx="116" cy="30" r="8" />
          <path d="M83 29 C77 39 80 48 87 51 L87 35 Z" />
          <path d="M117 29 C123 39 120 48 113 51 L113 35 Z" />
          <path d="M88 108 L83 157 L94 157 L100 116 L106 157 L117 157 L112 108 Z" />
        </>
      ) : null}

      <rect x={100 - shoulder / 2 - 5} y={shoulderY - 2} width="10" height={armBottom - shoulderY} rx="5" transform={"rotate(5 " + (100 - shoulder / 2) + " " + shoulderY + ")"} />
      <rect x={100 + shoulder / 2 - 5} y={shoulderY - 2} width="10" height={armBottom - shoulderY} rx="5" transform={"rotate(-5 " + (100 + shoulder / 2) + " " + shoulderY + ")"} />
      <circle cx={100 - shoulder / 2 - 5} cy={armBottom} r="5" />
      <circle cx={100 + shoulder / 2 + 5} cy={armBottom} r="5" />
    </g>
  );
}

export function getCharacterSilhouetteSvg({
  gender,
  stage,
  color = "#a1a1aa",
  opacity = 0.16,
}: SilhouetteOptions) {
  const safeGender = normalizeGender(gender);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 260"><g opacity="${opacity}" fill="${color}">${getSilhouetteMarkup(safeGender, stage)}</g></svg>`;
}

function getSilhouetteMarkup(gender: Gender, stage: AgeStage) {
  const child = stage === "niño";
  const teen = stage === "adolescente";
  const female = gender === "femenino";
  const neutral = gender === "indefinido";

  const headR = child ? 18 : teen ? 16 : 15;
  const shoulder = child ? 36 : teen ? (female ? 43 : 48) : (female ? 48 : 56);
  const waist = child ? 29 : teen ? (female ? 28 : 36) : (female ? 29 : 39);
  const hip = child ? 34 : teen ? (female ? 40 : 36) : (female ? 47 : 39);
  const shoulderY = 61;
  const waistY = child ? 99 : 108;
  const hipY = child ? 117 : 132;
  const legBottom = child ? 205 : teen ? 222 : 236;
  const armBottom = child ? 124 : teen ? 145 : 158;
  const circle = `<circle cx="100" cy="30" r="${headR}"/>`;
  const arms = `<rect x="${100 - shoulder / 2 - 5}" y="59" width="10" height="${armBottom - shoulderY}" rx="5" transform="rotate(5 ${100 - shoulder / 2} 61)"/><rect x="${100 + shoulder / 2 - 5}" y="59" width="10" height="${armBottom - shoulderY}" rx="5" transform="rotate(-5 ${100 + shoulder / 2} 61)"/><circle cx="${95 - shoulder / 2}" cy="${armBottom}" r="5"/><circle cx="${105 + shoulder / 2}" cy="${armBottom}" r="5"/>`;
  const torso = `M${100 - shoulder / 2} 61 C${100 - shoulder * .36} 57 ${100 - waist / 2} 84 ${100 - waist / 2} ${waistY} L${100 - hip / 2} ${hipY} L${100 + hip / 2} ${hipY} L${100 + waist / 2} ${waistY} C${100 + waist / 2} 84 ${100 + shoulder * .36} 57 ${100 + shoulder / 2} 61Z`;
  const legs = female && !child
    ? `M${100 - hip / 2} ${hipY} L86 ${legBottom} L97 ${legBottom} L100 ${hipY + 7} L103 ${legBottom} L114 ${legBottom} L${100 + hip / 2} ${hipY}Z`
    : neutral && !child
      ? `M97 ${hipY} L89 ${legBottom} L97 ${legBottom} L100 ${hipY + 14} L103 ${legBottom} L111 ${legBottom} L103 ${hipY}Z`
      : `M${100 - hip / 2 + 3} ${hipY} L88 ${legBottom} L97 ${legBottom} L97 ${hipY + 9} L103 ${hipY + 9} L103 ${legBottom} L112 ${legBottom} L${100 + hip / 2 - 3} ${hipY}Z`;

  let figure = circle;
  if (female && !child) {
    figure += `<path d="M82 31 C81 17 90 9 101 10 C114 10 121 19 119 35 C114 27 108 23 100 24 C94 25 88 28 82 31Z"/><path d="${torso}"/><path d="${legs}"/>`;
  } else {
    figure += `<path d="${torso}"/>${neutral && !child ? `<path d="${legs}"/>` : `<path d="${legs}"/>`}`;
  }
  if (child && female) {
    figure += `<circle cx="84" cy="30" r="8"/><circle cx="116" cy="30" r="8"/><path d="M83 29 C77 39 80 48 87 51 L87 35Z"/><path d="M117 29 C123 39 120 48 113 51 L113 35Z"/>`;
  }
  return figure + arms;
}

export function CharacterSilhouette({
  age,
  gender,
  className = "",
}: {
  age: number;
  gender: Gender;
  className?: string;
}) {
  const stage = getAgeStage(age);
  const safeGender = normalizeGender(gender);

  return (
    <svg
      viewBox="0 0 200 260"
      className={className}
      preserveAspectRatio="xMidYMax meet"
      aria-hidden="true"
      focusable="false"
      data-silhouette={safeGender + "-" + stage}
    >
      <defs>
        <filter id="xahya-silhouette-glow" x="-60%" y="-30%" width="220%" height="180%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g fill="currentColor" opacity="0.16" filter="url(#xahya-silhouette-glow)">
        <SilhouetteFigure gender={safeGender} stage={stage} fill="currentColor" />
      </g>
    </svg>
  );
}
