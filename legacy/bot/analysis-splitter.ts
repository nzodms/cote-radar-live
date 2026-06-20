/**
 * Découpe une analyse longue en plusieurs messages Telegram PROPRES, par section,
 * sans jamais perdre le début. Préserve les titres, ordonne, ajoute "Partie i/N".
 */

const TELEGRAM_LIMIT = 4096;

/** Une ligne est un début de section si elle commence par un titre. */
function isSectionHeader(line: string): boolean {
  return /^(🏟|🎯|🔎|⚠️|\d+\.\s)/.test(line.trim());
}

/** Découpe l'analyse en sections (titre + contenu). */
export function splitIntoSections(analysis: string): string[] {
  const lines = analysis.split("\n");
  const sections: string[] = [];
  let cur: string[] = [];
  const hasContent = (arr: string[]) => arr.some((l) => l.trim().length > 0);

  for (const line of lines) {
    if (isSectionHeader(line) && hasContent(cur)) {
      sections.push(cur.join("\n").trim());
      cur = [line];
    } else {
      cur.push(line);
    }
  }
  if (hasContent(cur)) sections.push(cur.join("\n").trim());
  return sections.length > 0 ? sections : [analysis.trim()];
}

/** Découpe dure d'un bloc trop long (fallback, par lignes puis par caractères). */
function hardSplit(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const out: string[] = [];
  let buf = "";
  for (const line of text.split("\n")) {
    if (line.length > maxLen) {
      if (buf) {
        out.push(buf);
        buf = "";
      }
      for (let i = 0; i < line.length; i += maxLen) out.push(line.slice(i, i + maxLen));
      continue;
    }
    const cand = buf ? `${buf}\n${line}` : line;
    if (cand.length > maxLen) {
      if (buf) out.push(buf);
      buf = line;
    } else {
      buf = cand;
    }
  }
  if (buf) out.push(buf);
  return out;
}

/** Regroupe les sections en parties sous `maxLen` (sans couper une section). */
function packSections(analysis: string, maxLen: number): string[] {
  const sections = splitIntoSections(analysis);
  const parts: string[] = [];
  let buf = "";
  const flush = () => {
    if (buf) {
      parts.push(buf);
      buf = "";
    }
  };
  for (const sec of sections) {
    if (sec.length > maxLen) {
      flush();
      parts.push(...hardSplit(sec, maxLen));
      continue;
    }
    const cand = buf ? `${buf}\n\n${sec}` : sec;
    if (cand.length > maxLen) {
      flush();
      buf = sec;
    } else {
      buf = cand;
    }
  }
  flush();
  return parts.length > 0 ? parts : [analysis.trim()];
}

/**
 * Renvoie les messages prêts à envoyer. Si plusieurs parties, chaque message est
 * préfixé par "📄 Partie i/N" (la 1re partie conserve le titre de l'analyse).
 * maxLen laisse une marge sous la limite Telegram (4096).
 */
export function buildAnalysisParts(analysis: string, maxLen = 3500): string[] {
  const safeMax = Math.min(maxLen, TELEGRAM_LIMIT - 40);
  const raw = packSections(analysis, safeMax - 24); // -24 pour le header "Partie i/N"
  if (raw.length <= 1) return raw;
  const n = raw.length;
  return raw.map((p, i) => `📄 Partie ${i + 1}/${n}\n\n${p}`);
}
