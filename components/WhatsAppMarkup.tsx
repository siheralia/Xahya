"use client";

import type { ReactNode } from "react";

function parseInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\`[^\`\n]*\`|\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));

    const token = match[0];
    const key = "m-" + match.index;

    if (token.startsWith("`") && token.endsWith("`")) {
      nodes.push(<code key={key} className="rounded bg-zinc-800/80 px-1.5 py-0.5 font-mono text-[0.9em] text-zinc-200">{token.slice(1, -1)}</code>);
    } else if (token.startsWith("*") && token.endsWith("*")) {
      nodes.push(<strong key={key} className="font-bold text-white">{parseInline(token.slice(1, -1))}</strong>);
    } else if (token.startsWith("_") && token.endsWith("_")) {
      nodes.push(<em key={key} className="italic text-zinc-200">{parseInline(token.slice(1, -1))}</em>);
    } else if (token.startsWith("~") && token.endsWith("~")) {
      nodes.push(<del key={key} className="text-zinc-400">{parseInline(token.slice(1, -1))}</del>);
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

export function WhatsAppMarkup({ text }: { text: string }) {
  const lines = text.split("\n");

  return (
    <div className="whitespace-pre-wrap break-words text-[15px] leading-7 text-zinc-300">
      {lines.map((line, index) => {
        const isQuote = line.startsWith("> ");
        const quoteText = isQuote ? line.slice(2) : line;

        if (isQuote) {
          return (
            <blockquote key={"line-" + index} className="my-1 border-l-2 border-rose-400/60 pl-3 text-zinc-400">
              {parseInline(quoteText)}
            </blockquote>
          );
        }

        return (
          <span key={"line-" + index}>
            {parseInline(line)}
            {index < lines.length - 1 ? "\n" : null}
          </span>
        );
      })}
    </div>
  );
}