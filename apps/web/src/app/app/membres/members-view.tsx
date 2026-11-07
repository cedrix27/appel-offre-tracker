"use client";

import { useState } from "react";
import { Trash2, UserPlus, Users } from "lucide-react";
import { useSession } from "@/components/app/session";
import { FormAlert, FormField, fieldAria } from "@/components/form";
import { NativeSelect } from "@/components/inputs";
import { EmptyState, ErrorState, LoadingBlock, PageHeader, Panel } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api, errorMessage } from "@/lib/api";
import { ROLE_LABELS } from "@/lib/labels";
import { fieldErrors, inviteMemberSchema } from "@/lib/schemas";
import type { CompanyMember } from "@/lib/types";
import { useApi } from "@/lib/use-api";

export function MembersView() {
  const { me, isCompanyAdmin } = useSession();
  const { data, error, loading, reload, mutate } = useApi<CompanyMember[]>("/company/members");
  const [toRemove, setToRemove] = useState<CompanyMember | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; message: string } | null>(null);

  async function confirmRemove() {
    if (!toRemove) return;
    const m = toRemove;
    setToRemove(null);
    try {
      await api.del(`/company/members/${m.id}`);
      mutate((list) => list?.filter((x) => x.id !== m.id));
      setNotice({ tone: "success", message: `${m.fullName} a été retiré de l'entreprise.` });
    } catch (e) {
      setNotice({ tone: "danger", message: errorMessage(e) });
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Entreprise"
        title="Membres"
        description="Les membres consultent les annonces et le suivi. Les administrateurs gèrent le profil, les membres et les invitations."
      />

      {isCompanyAdmin && (
        <InviteForm
          onInvited={(m) => {
            setNotice({ tone: "success", message: `Invitation envoyée à ${m.email}.` });
            reload();
          }}
        />
      )}

      {notice && (
        <FormAlert tone={notice.tone} className="mb-4" testId="members-notice">
          {notice.message}
        </FormAlert>
      )}

      {error ? (
        <ErrorState message={error.message} onRetry={reload} />
      ) : loading && !data ? (
        <LoadingBlock rows={2} />
      ) : !data?.length ? (
        <EmptyState icon={Users} title="Aucun membre" />
      ) : (
        <ul className="flex flex-col gap-2" data-testid="members-list">
          {data.map((m) => {
            const isSelf = m.userId === me.user.id;
            return (
              <li
                key={m.id}
                data-testid="member-row"
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold">
                    {m.fullName}
                    {isSelf && <span className="ml-1 font-normal text-ink-2">(vous)</span>}
                  </p>
                  <p className="truncate text-[12px] text-ink-2">{m.email}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={m.role === "COMPANY_ADMIN" ? "default" : "neutral"}>{ROLE_LABELS[m.role] ?? m.role}</Badge>
                  {m.invitedPending && <Badge variant="warning">Invitation en attente</Badge>}
                  {isCompanyAdmin && !isSelf && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-danger"
                      aria-label={`Retirer ${m.fullName}`}
                      onClick={() => setToRemove(m)}
                      data-testid="remove-member"
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={toRemove !== null} onOpenChange={(open) => !open && setToRemove(null)}>
        <DialogContent>
          <DialogTitle>Retirer ce membre ?</DialogTitle>
          <DialogDescription>
            {toRemove?.fullName} ({toRemove?.email}) n&apos;aura plus accès aux annonces et au suivi de l&apos;entreprise.
          </DialogDescription>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Annuler</DialogClose>
            <Button variant="destructive" onClick={confirmRemove} data-testid="confirm-remove">
              Retirer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function InviteForm({ onInvited }: { onInvited: (m: { email: string }) => void }) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setFormError(null);
    const parsed = inviteMemberSchema.safeParse(Object.fromEntries(new FormData(form)));
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setPending(true);
    try {
      await api.post("/company/members", parsed.data);
      form.reset();
      onInvited(parsed.data);
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <Panel className="mb-6">
      <h2 className="flex items-center gap-2 text-[16px]">
        <UserPlus className="size-4 text-brand" aria-hidden />
        Inviter un membre
      </h2>
      <p className="mt-1 text-[12px] text-ink-2">La personne reçoit un e-mail pour choisir son mot de passe.</p>
      <form onSubmit={onSubmit} noValidate className="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-start" data-testid="invite-member-form">
        <FormField id="invite-fullName" label="Nom et prénom" error={errors.fullName}>
          <Input {...fieldAria("invite-fullName", errors.fullName)} name="fullName" autoComplete="off" />
        </FormField>
        <FormField id="invite-email" label="Adresse e-mail" error={errors.email}>
          <Input {...fieldAria("invite-email", errors.email)} name="email" type="email" autoComplete="off" />
        </FormField>
        <FormField id="invite-role" label="Rôle" error={errors.role}>
          <NativeSelect id="invite-role" name="role" defaultValue="COMPANY_MEMBER">
            <option value="COMPANY_MEMBER">{ROLE_LABELS.COMPANY_MEMBER}</option>
            <option value="COMPANY_ADMIN">{ROLE_LABELS.COMPANY_ADMIN}</option>
          </NativeSelect>
        </FormField>
        <Button type="submit" disabled={pending} className="sm:mt-[22px]">
          {pending ? "Envoi…" : "Inviter"}
        </Button>
        {formError && (
          <FormAlert tone="danger" className="sm:col-span-4">
            {formError}
          </FormAlert>
        )}
      </form>
    </Panel>
  );
}
