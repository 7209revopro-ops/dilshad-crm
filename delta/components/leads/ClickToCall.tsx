"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Phone, PhoneCall, Copy, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "@/lib/toast";
import api from "@/lib/axios";
import { useQueryClient } from "@tanstack/react-query";

const THREECX_URL = "https://deltainstitutions.3cx.ae:5002";

function cleanPhone(raw: string): string {
  return raw.replace(/\s+/g, "").replace(/[()-]/g, "");
}

interface ClickToCallProps {
  phoneNumber: string;
  leadId?: string;
  leadName?: string;
  variant?: "ghost" | "outline";
  size?: "icon" | "sm";
  showLabel?: boolean;
  className?: string;
}

export function ClickToCall({
  phoneNumber,
  leadId,
  leadName,
  variant = "ghost",
  size = "icon",
  showLabel = false,
  className = "",
}: ClickToCallProps) {
  const [isDialing, setIsDialing] = useState(false);
  const queryClient = useQueryClient();

  if (!phoneNumber) return null;

  const clean = cleanPhone(phoneNumber);

  async function logCall() {
    try {
      await api.post(`/calls/click?phone_number=${encodeURIComponent(phoneNumber)}${leadId ? `&lead_id=${leadId}` : ""}`);
    } catch {
      // non-fatal — logging failure shouldn't block the call
    }
    // Increment the lead's call count; the backend also stamps firstContactTime
    // on the assigned agent's first call. Fire-and-forget — never blocks the call.
    if (leadId) {
      try {
        await api.patch(`/leads/${leadId}/call-count`, { action: "increment" });
        queryClient.invalidateQueries({ queryKey: ["leads"] });
      } catch {
        // non-fatal
      }
    }
  }

  async function handleWebClient() {
    setIsDialing(true);
    await logCall();

    const url = `${THREECX_URL}/#/call?phone=${encodeURIComponent(clean)}`;
    const features = [
      "width=440",
      "height=680",
      `left=${Math.round(window.screenX + (window.outerWidth - 440) / 2)}`,
      `top=${Math.round(window.screenY + (window.outerHeight - 680) / 2)}`,
      "resizable=yes",
      "scrollbars=yes",
      "toolbar=no",
      "menubar=no",
      "location=no",
      "status=no",
    ].join(",");

    const popup = window.open(url, "3cx-popup", features);

    // If popup already open, just focus it
    if (popup) {
      popup.focus();
    } else {
      // Popup blocked — fall back to new tab
      window.open(url, "_blank");
    }

    toast.success(`Calling ${leadName || phoneNumber} via 3CX…`, {
      description: popup ? "3CX popup opened — click Call to connect" : 'Allow popups for this site to use the 3CX popup',
      duration: 4000,
    });
    setTimeout(() => setIsDialing(false), 2000);
  }

  async function handleTelProtocol() {
    setIsDialing(true);
    await logCall();
    window.location.href = `tel:${clean}`;
    toast.info(`Dialing ${leadName || phoneNumber}…`, {
      description: "Requires 3CX desktop app or system phone app",
      duration: 3000,
    });
    setTimeout(() => setIsDialing(false), 2000);
  }

  function handleCopy() {
    navigator.clipboard.writeText(phoneNumber);
    toast.success("Phone number copied!");
  }

  return (
    <TooltipProvider>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant={variant}
                size={size}
                disabled={isDialing}
                className={`${className} text-green-400 hover:text-green-300 hover:bg-green-500/10 ${isDialing ? "animate-pulse" : ""}`}
              >
                <motion.div whileTap={{ scale: 0.9 }}>
                  {isDialing ? (
                    <PhoneCall className="h-4 w-4 animate-bounce" />
                  ) : (
                    <Phone className="h-4 w-4" />
                  )}
                </motion.div>
                {showLabel && (
                  <span className="ml-2">{isDialing ? "Calling…" : "Call"}</span>
                )}
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="top">
            Call {leadName || phoneNumber}
          </TooltipContent>
        </Tooltip>

        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={handleWebClient} className="cursor-pointer">
            <Phone className="mr-2 h-4 w-4 text-green-500" />
            <span>Call via 3CX Web Client</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleTelProtocol} className="cursor-pointer">
            <PhoneCall className="mr-2 h-4 w-4 text-blue-500" />
            <span>Call via tel: protocol</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleCopy} className="cursor-pointer">
            <Copy className="mr-2 h-4 w-4" />
            <span>Copy number</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled className="text-xs text-muted-foreground">
            <Settings className="mr-2 h-3 w-3" />
            <span>{phoneNumber}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </TooltipProvider>
  );
}
