"use client";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogFooter,
} from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAssignLead } from "@/hooks/useLeads";
import { useUsers } from "@/hooks/useUsers";
import type { Lead } from "@/types/lead";

interface AssignLeadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: Lead | null;
}

/** Hand one lead to someone else — the Leads list's Assign button (super admin). */
export function AssignLeadDialog({ open, onOpenChange, lead }: AssignLeadDialogProps) {
  const [selectedUser, setSelectedUser] = useState<string>("");
  const { mutate: assignLead, isPending: assigning } = useAssignLead();
  const { data: usersData } = useUsers({ status: "active", limit: "100" });
  const users = usersData?.data ?? [];

  const current = lead?.assignedTo && typeof lead.assignedTo === "object" ? lead.assignedTo : null;
  const currentId = current?._id ?? (typeof lead?.assignedTo === "string" ? lead.assignedTo : "");

  // The dialog stays mounted between leads — start every opening with nobody picked
  useEffect(() => {
    if (open) setSelectedUser("");
  }, [open, lead?._id]);

  const close = () => { setSelectedUser(""); onOpenChange(false); };

  const handleAssign = () => {
    if (!lead || !selectedUser || selectedUser === currentId) return;
    assignLead(
      { id: lead._id, userId: selectedUser },
      { onSuccess: close }
    );
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())}>
      <ResponsiveDialogContent desktopClassName="max-w-sm">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Assign Lead</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>

        <div className="space-y-4 py-2 px-4 sm:px-0">
          {lead && (
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{lead.name}</span>
              {" — "}
              {current ? <>with <span className="font-medium text-foreground">{current.name}</span> now</> : "not assigned yet"}
            </p>
          )}

          <div className="space-y-1.5">
            <Label>Assign to</Label>
            <Select value={selectedUser} onValueChange={setSelectedUser}>
              <SelectTrigger>
                <SelectValue placeholder="Select a user" />
              </SelectTrigger>
              <SelectContent>
                {users.map((user) => (
                  <SelectItem key={user._id} value={user._id} disabled={user._id === currentId}>
                    {user.name}
                    {user.designation ? ` — ${user.designation}` : ""}
                    {user._id === currentId ? " (current)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <ResponsiveDialogFooter>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button onClick={handleAssign} disabled={!selectedUser || selectedUser === currentId || assigning}>
            {assigning && <Loader2 className="h-4 w-4 animate-spin" />}
            Assign
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
