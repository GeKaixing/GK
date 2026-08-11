"use client"

import { Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState, useTransition } from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

export default function ClearHistoryButton() {
  const t = useTranslations("ImitationX.Sidebar")
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const handleClear = async (): Promise<void> => {
    try {
      await fetch("/api/history", { method: "DELETE" })
    } catch (error) {
      console.error("Failed to clear browsing history:", error)
      return
    }
    setIsOpen(false)
    // Re-render the server page: the list empties and the button disappears.
    startTransition(() => router.refresh())
  }

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          disabled={isPending}
          className="flex cursor-pointer items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-red-500/40 hover:text-red-500 disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" />
          <span>{t("clearHistory")}</span>
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("clearHistoryTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{t("clearHistoryConfirm")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setIsOpen(false)}>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={() => void handleClear()}>
            {isPending ? "…" : t("clearHistory")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
