/**
 * Commentary scraper (alias d'architecture). Réutilise le watcher existant qui
 * récupère une page publique de commentaires et la transforme en événements
 * structurés via lib/commentary-parser.
 */

export { fetchWinamaxCommentary as fetchCommentary, extractCommentaryItems } from "../winamax-watcher";
