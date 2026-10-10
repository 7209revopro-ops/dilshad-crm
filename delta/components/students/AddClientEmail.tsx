"use client";

import { useState } from "react";
import { Loader2, Mail, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAddEnrolmentEmail } from "@/hooks/useEnrolments";
import { isFinanceEmail } from "@/types/student";

/**
 * "Add the client's email and send again" (2026-10-10).
 *
 * For a close finance refused because it went without the client's email —
 * closes used to be taken without one, and finance's intake refuses those for
 * good. The correction can't reach them (finance never had them to send
 * back), so the email is asked for here, inline, and saving sends the
 * enrolment to finance at once: the same enrolment, to the same finance
 * organization, with the email — kept on the lead too. Shown only where the
 * server says the email is what held it up (`needsClientEmail`), on My
 * Enrolments, the enrolment's page and the student's page.
 *
 * Whoever may not act on enrolments is told who can, rather than given a
 * field the server would refuse.
 */
export function AddClientEmail({ studentId, initial, mayAct = true, className }: {
  studentId: string;
  /**
   * What the field starts from — the server's `suggestedEmail`: the
   * enrolment's email if finance would take it, else the lead's (people add it
   * to the lead by hand). Only filled in: nothing goes until the button is pressed.
   */
  initial?: string | null;
  mayAct?: boolean;
  className?: string;
}) {
  const add = useAddEnrolmentEmail();
  const start = (initial ?? "").trim();
  const [email, setEmail] = useState(isFinanceEmail(start) ? start : "");
  const value = email.trim();
  const valid = isFinanceEmail(value);
  const prefilled = Boolean(value) && value === start;

  return (
    <div className={cn("rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2.5", className)}>
      <p className="flex items-start gap-1.5 text-xs text-red-700 dark:text-red-300">
        <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Finance couldn&apos;t take this enrolment — it went without the client&apos;s email.
          {mayAct ? " Add the client's email and send again:" : " Whoever closed it can add the email and send it again."}
        </span>
      </p>
      {mayAct && (
        <form
          className="mt-2 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid && !add.isPending) add.mutate({ id: studentId, email: value });
          }}
        >
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="client@example.com"
            className="h-8 min-w-[12rem] flex-1 text-xs"
            aria-label="Client email"
            autoComplete="off"
            disabled={add.isPending}
          />
          <Button type="submit" size="sm" className="h-8 gap-1.5 text-xs" disabled={!valid || add.isPending}>
            {add.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
            {add.isPending ? "Sending…" : "Add email & send again"}
          </Button>
          <p className={cn("w-full text-[10px]", value && !valid ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>
            {value && !valid
              ? "That isn't an email address finance will take."
              : prefilled
                ? "Filled in from the client's details here — check it, then send. It goes to finance at once as the same enrolment."
                : "It goes to finance at once as the same enrolment, and the email is kept on the lead too."}
          </p>
        </form>
      )}
    </div>
  );
}
