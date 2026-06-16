/**
 * Footer obligatoire de jeu responsable. Wording imposé par le cahier des charges.
 */
export function ResponsibleGamingFooter() {
  return (
    <footer className="mt-10 border-t border-border bg-night-900/40">
      <div className="px-4 py-5 sm:px-6">
        <p className="text-[11px] leading-relaxed text-slate-500">
          Analyse informative. Aucun résultat n&apos;est garanti. Les paris sportifs comportent un
          risque de perte d&apos;argent. Réservé aux personnes majeures. Jouez de manière responsable.
        </p>
        <p className="mt-2 text-[11px] text-slate-600">
          CoteRadar Live — données via API-Football. Coupe du monde 2026 uniquement. Ce service
          n&apos;est pas un opérateur de paris.
        </p>
      </div>
    </footer>
  );
}
