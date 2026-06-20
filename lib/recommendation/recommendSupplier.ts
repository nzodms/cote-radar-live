import type {
  AIRules,
  Order,
  RecommendationResult,
  Supplier,
  SupplierQuote,
  SupplierScore,
} from "@/types";
import { avgDelay, clamp } from "@/lib/utils";

export function marginForQuote(order: Order, quote: SupplierQuote) {
  const value = order.salePrice * order.quantity - quote.totalCost * order.quantity;
  const percent = order.salePrice > 0 ? (order.salePrice - quote.totalCost) / order.salePrice * 100 : 0;
  return { value, percent };
}

function stockScore(stock: SupplierQuote["stockStatus"]): number {
  switch (stock) {
    case "confirmed":
      return 100;
    case "uncertain":
      return 50;
    case "unknown":
      return 40;
    case "out_of_stock":
      return 0;
  }
}

/**
 * Deterministic supplier recommendation.
 *
 * The score is a weighted blend of five normalized sub-scores (price, delay,
 * reliability, stock, margin). Weights come from the AI rules, so changing the
 * rules changes the outcome. Hard rules (max delay, reliability floor, blocked
 * suppliers, min margin, allowed countries) gate eligibility; the recommended
 * supplier is the highest-scoring *eligible* candidate.
 *
 * Designed so that the cheapest supplier is NOT always chosen.
 */
export function recommendSupplier(
  order: Order,
  quotes: SupplierQuote[],
  suppliers: Supplier[],
  rules: AIRules,
): RecommendationResult {
  const supplierById = new Map(suppliers.map((s) => [s.id, s]));

  if (quotes.length === 0) {
    return { orderId: order.id, recommendedSupplierId: null, scores: [], explanation: "" };
  }

  // Relative normalization ranges (price + delay are comparative).
  const totals = quotes.map((q) => q.totalCost);
  const delays = quotes.map((q) => avgDelay(q.deliveryMinDays, q.deliveryMaxDays));
  const minTotal = Math.min(...totals);
  const maxTotal = Math.max(...totals);
  const minDelay = Math.min(...delays);
  const maxDelay = Math.max(...delays);

  const w = rules.weights;
  const weightSum = w.price + w.delay + w.reliability + w.stock + w.margin || 1;

  const scores: SupplierScore[] = quotes.map((quote) => {
    const supplier = supplierById.get(quote.supplierId);
    const { value: marginValue, percent: marginPercent } = marginForQuote(order, quote);
    const delay = avgDelay(quote.deliveryMinDays, quote.deliveryMaxDays);

    const priceScore = maxTotal === minTotal ? 100 : ((maxTotal - quote.totalCost) / (maxTotal - minTotal)) * 100;
    const delayScore = maxDelay === minDelay ? 100 : ((maxDelay - delay) / (maxDelay - minDelay)) * 100;
    const reliabilityScore = quote.reliabilityScore;
    const stkScore = stockScore(quote.stockStatus);
    const marginScore = clamp((marginPercent / 80) * 100, 0, 100);

    const breakdown = {
      price: Math.round(priceScore),
      delay: Math.round(delayScore),
      reliability: Math.round(reliabilityScore),
      stock: Math.round(stkScore),
      margin: Math.round(marginScore),
    };

    const weighted =
      (priceScore * w.price +
        delayScore * w.delay +
        reliabilityScore * w.reliability +
        stkScore * w.stock +
        marginScore * w.margin) /
      weightSum;

    // ---- Eligibility (hard rules) ----
    const violations: string[] = [];
    const reasons: string[] = [];

    const isBlocked = supplier?.blocked || rules.blockedSupplierIds.includes(quote.supplierId);
    if (isBlocked) violations.push("Fournisseur bloqué");

    if (quote.deliveryMaxDays > rules.maximumDeliveryDays) {
      violations.push(
        `Délai ${quote.deliveryMinDays}–${quote.deliveryMaxDays} j > max ${rules.maximumDeliveryDays} j`,
      );
    }
    if (quote.reliabilityScore < rules.excludeReliabilityBelow) {
      violations.push(`Fiabilité ${quote.reliabilityScore} < seuil ${rules.excludeReliabilityBelow}`);
    }
    if (marginPercent < rules.minimumMarginPercent) {
      violations.push(`Marge ${marginPercent.toFixed(0)} % < min ${rules.minimumMarginPercent} %`);
    }
    if (
      rules.allowedCountries.length > 0 &&
      supplier &&
      !rules.allowedCountries.includes(supplier.countryCode)
    ) {
      violations.push(`Pays ${supplier.country} non autorisé`);
    }
    if (rules.preferConfirmedStock && quote.stockStatus !== "confirmed") {
      reasons.push("Stock non confirmé (pénalisé)");
    }

    const eligible = violations.length === 0;

    // Preferred supplier: small bonus + tiebreaker.
    const isPreferred =
      supplier?.preferred || rules.preferredSupplierIds.includes(quote.supplierId);
    const preferredBonus = isPreferred ? 5 : 0;
    if (isPreferred) reasons.push("Fournisseur préféré");

    const needsManualValidation = quote.totalCost * order.quantity > rules.manualValidationAbove;
    if (needsManualValidation) {
      reasons.push(`Validation manuelle requise (> ${rules.manualValidationAbove} €)`);
    }

    // Positive reasons for transparency
    if (breakdown.price >= 80) reasons.push("Très bon prix");
    if (quote.stockStatus === "confirmed") reasons.push("Stock confirmé");
    if (quote.reliabilityScore >= 90) reasons.push("Fiabilité élevée");
    if (breakdown.delay >= 80) reasons.push("Délai court");

    return {
      supplierId: quote.supplierId,
      quoteId: quote.id,
      total: clamp(Math.round((weighted + preferredBonus) * 10) / 10, 0, 100),
      breakdown,
      marginValue,
      marginPercent,
      eligible,
      preferredBonus,
      needsManualValidation,
      violations,
      reasons: Array.from(new Set(reasons)),
    };
  });

  // Sort: eligible first (by score desc), then ineligible (by score desc).
  scores.sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    return b.total - a.total;
  });

  const recommended = scores.find((s) => s.eligible) ?? null;
  const recommendedSupplierId = recommended?.supplierId ?? null;

  return {
    orderId: order.id,
    recommendedSupplierId,
    scores,
    explanation: buildExplanation(order, scores, suppliers, rules),
  };
}

function buildExplanation(
  order: Order,
  scores: SupplierScore[],
  suppliers: Supplier[],
  rules: AIRules,
): string {
  const nameOf = (id: string) => suppliers.find((s) => s.id === id)?.name ?? "Fournisseur";
  const recommended = scores.find((s) => s.eligible);
  if (!recommended) {
    return "Aucun fournisseur ne respecte vos règles actuelles. Ajustez le délai maximum, le seuil de fiabilité ou la marge minimale pour débloquer une recommandation.";
  }

  const parts: string[] = [];
  parts.push(
    `${nameOf(recommended.supplierId)} offre le meilleur équilibre prix / stock / fiabilité avec un délai conforme à votre maximum de ${rules.maximumDeliveryDays} j (score ${recommended.total}/100, marge ${recommended.marginPercent.toFixed(0)} %).`,
  );

  const others = scores.filter((s) => s.supplierId !== recommended.supplierId);
  for (const s of others.slice(0, 2)) {
    if (!s.eligible && s.violations.length > 0) {
      parts.push(`${nameOf(s.supplierId)} est écarté : ${s.violations.join(", ").toLowerCase()}.`);
    } else if (s.breakdown.price > recommended.breakdown.price) {
      parts.push(
        `${nameOf(s.supplierId)} est moins cher mais son score global (${s.total}) reste inférieur.`,
      );
    } else if (s.breakdown.delay > recommended.breakdown.delay) {
      parts.push(`${nameOf(s.supplierId)} est plus rapide mais plus coûteux.`);
    }
  }

  if (recommended.needsManualValidation) {
    parts.push("Montant élevé : une validation manuelle est recommandée avant paiement.");
  }

  return parts.join(" ");
}
