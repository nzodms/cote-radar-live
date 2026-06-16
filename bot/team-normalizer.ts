/**
 * Normalisation des noms d'équipes + résolution texte -> équipe (FR/EN/codes).
 *
 * On ne dépend pas d'une liste exhaustive: les équipes inconnues matchent par
 * nom normalisé. Les alias couvrent les variantes FR/EN/3-lettres courantes.
 */

export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

interface TeamGroup {
  canonical: string;
  aliases: string[];
}

// canonical = clé interne; aliases = variantes (seront normalisées).
const TEAM_GROUPS: TeamGroup[] = [
  { canonical: "france", aliases: ["france", "fra", "les bleus"] },
  { canonical: "senegal", aliases: ["senegal", "sénégal", "sen", "lions"] },
  { canonical: "argentina", aliases: ["argentina", "argentine", "arg", "albiceleste"] },
  { canonical: "algeria", aliases: ["algeria", "algérie", "algerie", "alg", "fennecs"] },
  { canonical: "portugal", aliases: ["portugal", "por", "selecao", "seleção"] },
  { canonical: "dr_congo", aliases: ["dr congo", "rd congo", "congo dr", "congo", "republique democratique du congo", "république démocratique du congo", "cod"] },
  { canonical: "england", aliases: ["england", "angleterre", "eng", "three lions"] },
  { canonical: "croatia", aliases: ["croatia", "croatie", "cro", "hrvatska"] },
  { canonical: "ghana", aliases: ["ghana", "gha", "black stars"] },
  { canonical: "panama", aliases: ["panama", "pan"] },
  { canonical: "norway", aliases: ["norway", "norvège", "norvege", "nor"] },
  { canonical: "iraq", aliases: ["iraq", "irak", "irq"] },
  { canonical: "austria", aliases: ["austria", "autriche", "aut"] },
  { canonical: "jordan", aliases: ["jordan", "jordanie", "jor"] },
  { canonical: "uzbekistan", aliases: ["uzbekistan", "ouzbekistan", "ouzbékistan", "uzb"] },
  { canonical: "colombia", aliases: ["colombia", "colombie", "col"] },
  { canonical: "switzerland", aliases: ["switzerland", "suisse", "sui", "svizzera"] },
  { canonical: "bosnia", aliases: ["bosnia and herzegovina", "bosnia", "bosnie", "bosnie herzegovine", "bosnie herzégovine", "bih"] },
  { canonical: "canada", aliases: ["canada", "can"] },
  { canonical: "qatar", aliases: ["qatar", "qat"] },
  { canonical: "brazil", aliases: ["brazil", "brésil", "bresil", "bra", "selecao bresilienne"] },
  { canonical: "morocco", aliases: ["morocco", "maroc", "mar", "lions de l atlas"] },
  { canonical: "scotland", aliases: ["scotland", "ecosse", "écosse", "sco"] },
  { canonical: "iran", aliases: ["iran", "irn"] },
  { canonical: "new_zealand", aliases: ["new zealand", "nouvelle zelande", "nouvelle zélande", "nzl", "all whites"] },
  { canonical: "usa", aliases: ["usa", "united states", "etats unis", "états unis", "us"] },
  { canonical: "mexico", aliases: ["mexico", "mexique", "mex"] },
  { canonical: "spain", aliases: ["spain", "espagne", "esp", "la roja"] },
  { canonical: "germany", aliases: ["germany", "allemagne", "ger", "deutschland", "mannschaft"] },
  { canonical: "netherlands", aliases: ["netherlands", "pays bas", "hollande", "ned", "holland", "oranje"] },
  { canonical: "belgium", aliases: ["belgium", "belgique", "bel", "diables rouges"] },
  { canonical: "japan", aliases: ["japan", "japon", "jpn"] },
  { canonical: "south_korea", aliases: ["south korea", "coree du sud", "corée du sud", "korea republic", "kor"] },
  { canonical: "australia", aliases: ["australia", "australie", "aus", "socceroos"] },
  { canonical: "uruguay", aliases: ["uruguay", "uru", "celeste"] },
  { canonical: "ecuador", aliases: ["ecuador", "equateur", "équateur", "ecu"] },
  { canonical: "nigeria", aliases: ["nigeria", "nga", "super eagles"] },
  { canonical: "egypt", aliases: ["egypt", "egypte", "égypte", "egy", "pharaons"] },
  { canonical: "tunisia", aliases: ["tunisia", "tunisie", "tun"] },
  { canonical: "ivory_coast", aliases: ["ivory coast", "cote d ivoire", "côte d ivoire", "civ", "elephants"] },
  { canonical: "cameroon", aliases: ["cameroon", "cameroun", "cmr", "lions indomptables"] },
  { canonical: "saudi_arabia", aliases: ["saudi arabia", "arabie saoudite", "ksa", "sau"] },
  { canonical: "poland", aliases: ["poland", "pologne", "pol"] },
  { canonical: "denmark", aliases: ["denmark", "danemark", "den"] },
  { canonical: "serbia", aliases: ["serbia", "serbie", "srb"] },
];

const ALIAS_TO_CANONICAL = new Map<string, string>();
const CANONICAL_TO_ALIASES = new Map<string, string[]>();
for (const g of TEAM_GROUPS) {
  const norm = g.aliases.map((a) => normalizeText(a)).filter(Boolean);
  CANONICAL_TO_ALIASES.set(g.canonical, [...new Set([normalizeText(g.canonical), ...norm])]);
  for (const a of CANONICAL_TO_ALIASES.get(g.canonical)!) ALIAS_TO_CANONICAL.set(a, g.canonical);
}

export function canonicalOf(name: string): string | null {
  return ALIAS_TO_CANONICAL.get(normalizeText(name)) ?? null;
}

/** true si l'équipe `apiName` est mentionnée dans `input` (mot entier). */
export function apiTeamMentionedIn(input: string, apiName: string): boolean {
  const inN = ` ${normalizeText(input)} `;
  const canonical = canonicalOf(apiName);
  const aliases = canonical ? CANONICAL_TO_ALIASES.get(canonical)! : [normalizeText(apiName)];
  return aliases.some((a) => a.length > 0 && inN.includes(` ${a} `));
}

/** true si deux noms désignent la même équipe (alias ou nom normalisé). */
export function sameTeam(a: string, b: string): boolean {
  const ca = canonicalOf(a);
  const cb = canonicalOf(b);
  if (ca && cb) return ca === cb;
  return normalizeText(a) === normalizeText(b);
}
