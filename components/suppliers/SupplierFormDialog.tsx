"use client";

import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useStore } from "@/lib/store/useStore";
import { toast } from "@/lib/store/toast";
import { supplierFormSchema, type SupplierFormValues } from "@/schemas";
import type { Supplier } from "@/types";

const EMPTY = {
  name: "",
  country: "",
  countryCode: "",
  specialty: "",
  whatsappNumber: "",
  language: "fr" as const,
  reliabilityScore: "85",
  averageDelayDays: "12",
  tags: "",
  notes: "",
};

export function SupplierFormDialog({
  supplier,
  open,
  onOpenChange,
}: {
  supplier: Supplier | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const addSupplier = useStore((s) => s.addSupplier);
  const updateSupplier = useStore((s) => s.updateSupplier);

  const [form, setForm] = useState<Record<string, string>>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    if (supplier) {
      setForm({
        name: supplier.name,
        country: supplier.country,
        countryCode: supplier.countryCode,
        specialty: supplier.specialty,
        whatsappNumber: supplier.whatsappNumber,
        language: supplier.language,
        reliabilityScore: String(supplier.reliabilityScore),
        averageDelayDays: String(supplier.averageDelayDays),
        tags: supplier.tags.join(", "),
        notes: supplier.notes,
      });
    } else {
      setForm(EMPTY);
    }
    setErrors({});
  }, [open, supplier]);

  const set = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const submit = () => {
    const candidate = {
      ...form,
      tags: form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    };
    const parsed = supplierFormSchema.safeParse(candidate);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        fieldErrors[String(issue.path[0])] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    const values: SupplierFormValues = parsed.data;
    if (supplier) {
      updateSupplier(supplier.id, values);
      toast("Fournisseur mis à jour", { description: values.name, tone: "success" });
    } else {
      addSupplier(values);
      toast("Fournisseur ajouté", { description: values.name, tone: "success" });
    }
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={supplier ? "Modifier le fournisseur" : "Ajouter un fournisseur"}
      description="Ces informations alimentent la recommandation IA."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={submit}>
            <Save className="h-4 w-4" />
            {supplier ? "Enregistrer" : "Ajouter"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 py-2 sm:grid-cols-2">
        <Field label="Nom" error={errors.name} className="sm:col-span-2">
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Agent Chen" />
        </Field>
        <Field label="Pays" error={errors.country}>
          <Input value={form.country} onChange={(e) => set("country", e.target.value)} placeholder="Chine" />
        </Field>
        <Field label="Code pays (ISO-2)" error={errors.countryCode}>
          <Input
            value={form.countryCode}
            onChange={(e) => set("countryCode", e.target.value.toUpperCase().slice(0, 2))}
            placeholder="CN"
          />
        </Field>
        <Field label="Spécialité" error={errors.specialty} className="sm:col-span-2">
          <Input value={form.specialty} onChange={(e) => set("specialty", e.target.value)} placeholder="Luminaires premium" />
        </Field>
        <Field label="Numéro WhatsApp" error={errors.whatsappNumber}>
          <Input value={form.whatsappNumber} onChange={(e) => set("whatsappNumber", e.target.value)} placeholder="+8613800000000" />
        </Field>
        <Field label="Langue préférée">
          <Select value={form.language} onChange={(e) => set("language", e.target.value)}>
            <option value="fr">Français</option>
            <option value="en">Anglais</option>
          </Select>
        </Field>
        <Field label="Score de fiabilité (0-100)" error={errors.reliabilityScore}>
          <Input type="number" min={0} max={100} value={form.reliabilityScore} onChange={(e) => set("reliabilityScore", e.target.value)} />
        </Field>
        <Field label="Délai moyen (jours)" error={errors.averageDelayDays}>
          <Input type="number" min={0} value={form.averageDelayDays} onChange={(e) => set("averageDelayDays", e.target.value)} />
        </Field>
        <Field label="Tags (séparés par des virgules)" className="sm:col-span-2">
          <Input value={form.tags} onChange={(e) => set("tags", e.target.value)} placeholder="Premium, Réactif, QC strict" />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Remarques internes…" />
        </Field>
      </div>
    </Dialog>
  );
}
