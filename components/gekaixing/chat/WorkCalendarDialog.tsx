"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  addDays,
  daysBetween,
  isoDateOnly,
  monthCells,
  monthLabel,
  sameDay,
  startOfDay,
  weekdayLabels,
} from "./date";
import type { GroupMember, WorkStatus, WorkTask } from "./types";

const WORK_STATUSES: WorkStatus[] = ["planned", "in_progress", "done"];
const COL_W = 24;

const STATUS_STYLE: Record<
  WorkStatus,
  { bar: string; badge: string; dot: string }
> = {
  planned: { bar: "bg-muted-foreground/40", badge: "bg-muted text-muted-foreground", dot: "bg-muted-foreground" },
  in_progress: { bar: "bg-blue-500", badge: "bg-blue-500/15 text-blue-600", dot: "bg-blue-500" },
  done: { bar: "bg-emerald-500", badge: "bg-emerald-500/15 text-emerald-600", dot: "bg-emerald-500" },
};

type ViewMode = "calendar" | "gantt" | "kanban" | "list" | "table";

interface FormState {
  title: string;
  description: string;
  assigneeId: string;
  status: string;
  startDate: string;
  endDate: string;
}

function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fromDateInputValue(v: string): Date {
  const [y, m, d] = v.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function emptyForm(): FormState {
  const today = new Date();
  return {
    title: "",
    description: "",
    assigneeId: "",
    status: "planned",
    startDate: toDateInputValue(today),
    endDate: toDateInputValue(addDays(today, 1)),
  };
}

function formFromTask(t: WorkTask): FormState {
  return {
    title: t.title,
    description: t.description ?? "",
    assigneeId: t.assigneeId ?? "",
    status: t.status,
    startDate: toDateInputValue(isoDateOnly(t.startDate)),
    endDate: toDateInputValue(isoDateOnly(t.endDate)),
  };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  currentUserId: string | undefined;
}

export default function WorkCalendarDialog({
  open,
  onOpenChange,
  conversationId,
  currentUserId,
}: Props) {
  const t = useTranslations("ImitationX.ChatPage");
  const locale = useLocale();

  const [tasks, setTasks] = useState<WorkTask[]>([]);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [callerRole, setCallerRole] = useState("member");
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>("calendar");
  const [calYear, setCalYear] = useState(() => new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<WorkTask | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<WorkTask | null>(null);

  const isAdmin = callerRole === "admin";

  const canManage = (task: WorkTask) =>
    isAdmin || (currentUserId != null && task.assigneeId === currentUserId);

  const isOverdue = (task: WorkTask) =>
    task.status !== "done" &&
    isoDateOnly(task.endDate) < startOfDay(new Date());

  const [search, setSearch] = useState("");
  const [filterAssignee, setFilterAssignee] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  const filteredTasks = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (q && !t.title.toLowerCase().includes(q)) return false;
      if (filterAssignee === "unassigned") {
        if (t.assigneeId) return false;
      } else if (filterAssignee !== "all" && t.assigneeId !== filterAssignee) {
        return false;
      }
      if (filterStatus !== "all" && t.status !== filterStatus) return false;
      return true;
    });
  }, [tasks, search, filterAssignee, filterStatus]);

  const reloadTasks = async () => {
    try {
      const res = await fetch(`/api/chat/conversations/${conversationId}/tasks`);
      const result = await res.json();
      if (result.success) {
        setTasks(result.data.tasks);
        setCallerRole(result.data.callerRole);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setSearch("");
      setFilterAssignee("all");
      setFilterStatus("all");
      try {
        const [tRes, mRes] = await Promise.all([
          fetch(`/api/chat/conversations/${conversationId}/tasks`),
          fetch(`/api/chat/conversations/${conversationId}/members`),
        ]);
        const tResult = await tRes.json();
        const mResult = await mRes.json();
        if (!cancelled) {
          if (tResult.success) {
            setTasks(tResult.data.tasks);
            setCallerRole(tResult.data.callerRole);
          }
          if (mResult.success) setMembers(mResult.data.members);
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [open, conversationId]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setFormOpen(true);
  };

  const openEdit = (task: WorkTask) => {
    setEditing(task);
    setForm(formFromTask(task));
    setFormOpen(true);
  };

  const openCreateOnDay = (day: Date) => {
    const iso = toDateInputValue(day);
    setEditing(null);
    setForm({ ...emptyForm(), startDate: iso, endDate: iso });
    setFormOpen(true);
  };

  const saveTask = async () => {
    if (!form.title.trim()) {
      toast.error(t("taskTitleRequired"));
      return;
    }
    const start = fromDateInputValue(form.startDate);
    const end = fromDateInputValue(form.endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      toast.error(t("dateRangeError"));
      return;
    }
    if (end < start) {
      toast.error(t("dateRangeError"));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        assigneeId: form.assigneeId || null,
        status: form.status,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      };
      const url = editing
        ? `/api/chat/conversations/${conversationId}/tasks/${editing.id}`
        : `/api/chat/conversations/${conversationId}/tasks`;
      const res = await fetch(url, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      if (result.success) {
        setFormOpen(false);
        setEditing(null);
        await reloadTasks();
      } else {
        toast.error(result.error || t("updateFailed"));
      }
    } catch {
      toast.error(t("updateFailed"));
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (task: WorkTask, status: string) => {
    try {
      const res = await fetch(
        `/api/chat/conversations/${conversationId}/tasks/${task.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        }
      );
      const result = await res.json();
      if (result.success) {
        setTasks((prev) =>
          prev.map((t) => (t.id === task.id ? { ...t, status } : t))
        );
      } else {
        toast.error(result.error || t("updateFailed"));
      }
    } catch {
      toast.error(t("updateFailed"));
    }
  };

  const doDelete = async () => {
    if (!deleting) return;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/chat/conversations/${conversationId}/tasks/${deleting.id}`,
        { method: "DELETE" }
      );
      const result = await res.json();
      if (result.success) {
        setTasks((prev) => prev.filter((t) => t.id !== deleting.id));
      } else {
        toast.error(result.error || t("updateFailed"));
      }
    } catch {
      toast.error(t("updateFailed"));
    } finally {
      setSaving(false);
      setDeleting(null);
    }
  };

  const fmt = (iso: string) =>
    new Intl.DateTimeFormat(locale === "zh-CN" ? "zh-CN" : "en", {
      month: "short",
      day: "numeric",
    }).format(isoDateOnly(iso));

  const statusLabel = (s: string) =>
    s === "in_progress"
      ? t("statusInProgress")
      : s === "done"
        ? t("statusDone")
        : t("statusPlanned");

  const handleCalMonthChange = ({
    year,
    month,
  }: {
    year: number;
    month: number;
  }) => {
    setCalYear(year);
    setCalMonth(month);
  };

  const views: { id: ViewMode; label: string }[] = [
    { id: "calendar", label: t("calendarView") },
    { id: "gantt", label: t("ganttView") },
    { id: "kanban", label: t("kanbanView") },
    { id: "list", label: t("listView") },
    { id: "table", label: t("tableView") },
  ];

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) setFormOpen(false);
          onOpenChange(o);
        }}
      >
        <DialogContent className="gap-0 p-0 sm:max-w-4xl">
          <DialogHeader className="border-b border-border/60 px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <DialogTitle className="text-base font-bold tracking-tight">
                {t("workCalendar")}
              </DialogTitle>
              {isAdmin && (
                <Button
                  size="sm"
                  className="h-8 gap-1 rounded-full px-3 text-sm"
                  onClick={openCreate}
                >
                  <Plus className="size-4" />
                  {t("newTask")}
                </Button>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {views.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setView(v.id)}
                  className={
                    "rounded-full px-3 py-1 text-xs font-medium transition-colors " +
                    (view === v.id
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground")
                  }
                >
                  {v.label}
                </button>
              ))}
            </div>
            <DialogDescription className="sr-only">
              {t("workCalendar")}
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t("loading")}
            </div>
          ) : (
            <>
              {tasks.length > 0 && (
                <SummaryToolbar
                  tasks={filteredTasks}
                  members={members}
                  search={search}
                  onSearch={setSearch}
                  filterAssignee={filterAssignee}
                  onFilterAssignee={setFilterAssignee}
                  filterStatus={filterStatus}
                  onFilterStatus={setFilterStatus}
                  statusLabel={statusLabel}
                />
              )}
              {tasks.length === 0 ? (
                <div className="px-4 py-16 text-center">
                  <Calendar className="mx-auto mb-3 size-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">{t("noTasks")}</p>
                  {isAdmin && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3 rounded-full"
                      onClick={openCreate}
                    >
                      <Plus className="size-4" />
                      {t("newTask")}
                    </Button>
                  )}
                </div>
              ) : filteredTasks.length === 0 ? (
                <div className="px-4 py-16 text-center text-sm text-muted-foreground">
                  {t("noFilterResults")}
                </div>
              ) : (
                <div className="max-h-[65vh] overflow-auto p-4">
                  {view === "calendar" && (
                    <CalendarView
                      year={calYear}
                      month={calMonth}
                      setMonth={handleCalMonthChange}
                      tasks={filteredTasks}
                      isAdmin={isAdmin}
                      onEdit={openEdit}
                      onCreateDay={openCreateOnDay}
                      isOverdue={isOverdue}
                      dotStyle={STATUS_STYLE}
                    />
                  )}
                  {view === "gantt" && (
                    <GanttView
                      tasks={filteredTasks}
                      statusLabel={statusLabel}
                      barStyle={STATUS_STYLE}
                    />
                  )}
                  {view === "kanban" && (
                    <KanbanView
                      tasks={filteredTasks}
                      isAdmin={isAdmin}
                      canManage={canManage}
                      onEdit={openEdit}
                      onDelete={setDeleting}
                      onChangeStatus={changeStatus}
                      isOverdue={isOverdue}
                      fmt={fmt}
                      statusLabel={statusLabel}
                    />
                  )}
                  {view === "list" && (
                    <ListView
                      tasks={filteredTasks}
                      canManage={canManage}
                      onChangeStatus={changeStatus}
                      isOverdue={isOverdue}
                      fmt={fmt}
                      statusLabel={statusLabel}
                      badgeStyle={STATUS_STYLE}
                    />
                  )}
                  {view === "table" && (
                    <TableView
                      tasks={filteredTasks}
                      isAdmin={isAdmin}
                      canManage={canManage}
                      onEdit={openEdit}
                      onDelete={setDeleting}
                      onChangeStatus={changeStatus}
                      isOverdue={isOverdue}
                      fmt={fmt}
                      statusLabel={statusLabel}
                      badgeStyle={STATUS_STYLE}
                    />
                  )}
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* 新建 / 编辑任务表单：嵌套在视图之上，保持上下文 */}
      <Dialog
        open={formOpen}
        onOpenChange={(o) => {
          if (!o) {
            setFormOpen(false);
            setEditing(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base font-bold tracking-tight">
              {editing ? t("editTask") : t("newTask")}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {editing ? t("editTask") : t("newTask")}
            </DialogDescription>
          </DialogHeader>
          <TaskForm
            members={members}
            form={form}
            setForm={setForm}
            onSave={() => void saveTask()}
            onCancel={() => {
              setFormOpen(false);
              setEditing(null);
            }}
            saving={saving}
            statusLabel={statusLabel}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("taskDeleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("taskDeleteConfirmDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void doDelete()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("deleteTask")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function SummaryToolbar({
  tasks,
  members,
  search,
  onSearch,
  filterAssignee,
  onFilterAssignee,
  filterStatus,
  onFilterStatus,
  statusLabel,
}: {
  tasks: WorkTask[];
  members: GroupMember[];
  search: string;
  onSearch: (v: string) => void;
  filterAssignee: string;
  onFilterAssignee: (v: string) => void;
  filterStatus: string;
  onFilterStatus: (v: string) => void;
  statusLabel: (s: string) => string;
}) {
  const t = useTranslations("ImitationX.ChatPage");
  const done = tasks.filter((task) => task.status === "done").length;
  const total = tasks.length;
  const overdue = tasks.filter(
    (task) =>
      task.status !== "done" &&
      isoDateOnly(task.endDate) < startOfDay(new Date())
  ).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="border-b border-border/60 px-4 py-3">
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">
          {t("taskProgress", { done, total })}
        </span>
        {overdue > 0 && (
          <span className="flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
            <span className="size-1.5 rounded-full bg-destructive" />
            {t("overdue")} {overdue}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={t("searchTasks")}
          className="h-8 w-48"
        />
        <select
          value={filterAssignee}
          onChange={(e) => onFilterAssignee(e.target.value)}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="all">{t("allAssignees")}</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
          <option value="unassigned">{t("unassigned")}</option>
        </select>
        <select
          value={filterStatus}
          onChange={(e) => onFilterStatus(e.target.value)}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="all">{t("allStatuses")}</option>
          {WORK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function TaskForm({
  members,
  form,
  setForm,
  onSave,
  onCancel,
  saving,
  statusLabel,
}: {
  members: GroupMember[];
  form: FormState;
  setForm: (f: FormState) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  statusLabel: (s: string) => string;
}) {
  const t = useTranslations("ImitationX.ChatPage");
  const inputCls =
    "h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const labelCls = "mb-1 block text-xs font-medium text-muted-foreground";

  return (
    <div className="space-y-3">
      <div>
        <label className={labelCls}>{t("taskTitle")}</label>
        <Input
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder={t("taskTitlePlaceholder")}
          className="h-9"
        />
      </div>
      <div>
        <label className={labelCls}>{t("taskDescription")}</label>
        <textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder={t("taskDescriptionPlaceholder")}
          rows={3}
          className={`${inputCls} h-auto min-h-20 resize-y py-2`}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>{t("taskAssignee")}</label>
          <select
            value={form.assigneeId}
            onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}
            className={inputCls}
          >
            <option value="">—</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>{t("taskStatus")}</label>
          <select
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value })}
            className={inputCls}
          >
            {WORK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>{t("taskStart")}</label>
          <input
            type="date"
            value={form.startDate}
            onChange={(e) => setForm({ ...form, startDate: e.target.value })}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>{t("taskEnd")}</label>
          <input
            type="date"
            value={form.endDate}
            onChange={(e) => setForm({ ...form, endDate: e.target.value })}
            className={inputCls}
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          {t("cancel")}
        </Button>
        <Button onClick={onSave} disabled={saving}>
          {saving && <Loader2 className="size-4 animate-spin" />}
          {t("save")}
        </Button>
      </div>
    </div>
  );
}

function CalendarView({
  year,
  month,
  setMonth,
  tasks,
  isAdmin,
  onEdit,
  onCreateDay,
  isOverdue,
  dotStyle,
}: {
  year: number;
  month: number;
  setMonth: (m: { year: number; month: number }) => void;
  tasks: WorkTask[];
  isAdmin: boolean;
  onEdit: (task: WorkTask) => void;
  onCreateDay: (day: Date) => void;
  isOverdue: (task: WorkTask) => boolean;
  dotStyle: Record<WorkStatus, { dot: string }>;
}) {
  const t = useTranslations("ImitationX.ChatPage");
  const locale = useLocale();
  const cells = monthCells(year, month);
  const labels = weekdayLabels(locale);

  const coveredTasks = (cell: Date) =>
    tasks.filter((t) => {
      const s = isoDateOnly(t.startDate);
      const e = isoDateOnly(t.endDate);
      return startOfDay(cell) >= s && startOfDay(cell) <= e;
    });

  const shift = (delta: number) => {
    const m = month + delta;
    const y = year + Math.floor(m / 12);
    const mm = ((m % 12) + 12) % 12;
    setMonth({ year: y, month: mm });
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          {monthLabel(year, month, locale)}
        </h3>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-7 rounded-full"
            onClick={() => shift(-1)}
            aria-label={t("prevMonth")}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 rounded-full"
            onClick={() => shift(1)}
            aria-label={t("nextMonth")}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-border/60 bg-border/60 text-center">
        {labels.map((l) => (
          <div
            key={l}
            className="bg-background py-1 text-[11px] font-medium text-muted-foreground"
          >
            {l}
          </div>
        ))}
        {cells.map((cell, i) =>
          cell ? (
            <div
              key={cell.getTime()}
              onClick={() => isAdmin && onCreateDay(cell)}
              className={
                "group relative min-h-[64px] bg-background p-1 text-left align-top " +
                (isAdmin ? "cursor-pointer" : "")
              }
            >
              {isAdmin && (
                <Plus className="absolute right-1 top-1 size-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              )}
              <span className="text-[11px] text-muted-foreground">
                {cell.getDate()}
              </span>
              <div className="mt-0.5 max-h-[64px] space-y-0.5 overflow-y-auto pr-0.5">
                {coveredTasks(cell).map((task) => {
                  const first = sameDay(cell, isoDateOnly(task.startDate));
                  if (first) {
                    return (
                      <button
                        key={task.id}
                        type="button"
                        disabled={!isAdmin}
                        onClick={(e) => {
                          e.stopPropagation();
                          onEdit(task);
                        }}
                        className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-[10px] leading-tight hover:bg-muted disabled:hover:bg-transparent"
                      >
                        <span
                          className={
                            "size-1.5 shrink-0 rounded-full " +
                            (isOverdue(task)
                              ? "bg-destructive"
                              : dotStyle[task.status as WorkStatus]?.dot ?? dotStyle.planned.dot)
                          }
                        />
                        <span
                          className={
                            "truncate " +
                            (isOverdue(task)
                              ? "font-semibold text-destructive"
                              : "text-foreground")
                          }
                        >
                          {task.title}
                        </span>
                      </button>
                    );
                  }
                  return (
                    <div
                      key={task.id}
                      title={task.title}
                      className={
                        "h-1 w-full rounded-full " +
                        (dotStyle[task.status as WorkStatus]?.dot ?? dotStyle.planned.dot)
                      }
                    />
                  );
                })}
              </div>
            </div>
          ) : (
            <div key={`blank-${i}`} className="min-h-[64px] bg-muted/30" />
          )
        )}
      </div>
    </div>
  );
}

function GanttView({
  tasks,
  statusLabel,
  barStyle,
}: {
  tasks: WorkTask[];
  statusLabel: (s: string) => string;
  barStyle: Record<WorkStatus, { bar: string }>;
}) {
  const t = useTranslations("ImitationX.ChatPage");
  const today = startOfDay(new Date());
  const starts = tasks.map((t) => isoDateOnly(t.startDate).getTime());
  const ends = tasks.map((t) => isoDateOnly(t.endDate).getTime());
  const rangeStart =
    starts.length > 0 ? startOfDay(new Date(Math.min(...starts))) : today;
  const rangeEnd =
    ends.length > 0 ? startOfDay(new Date(Math.max(...ends))) : addDays(today, 30);
  const totalDays = daysBetween(rangeStart, rangeEnd) + 1;
  const todayOff = daysBetween(rangeStart, today);

  const weekTicks: number[] = [];
  for (let i = 0; i < totalDays; i++) {
    const d = addDays(rangeStart, i);
    if (d.getDate() === 1 || d.getDay() === 1) weekTicks.push(i);
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-max">
        {/* 时间轴表头 */}
        <div className="mb-1 flex">
          <div className="w-40 shrink-0" />
          <div className="relative" style={{ width: totalDays * COL_W }}>
            {weekTicks.map((i) => (
              <span
                key={i}
                className="absolute -translate-x-1/2 text-[10px] text-muted-foreground"
                style={{ left: (i + 0.5) * COL_W }}
              >
                {addDays(rangeStart, i).getDate()}
              </span>
            ))}
            {todayOff >= 0 && todayOff < totalDays && (
              <span
                className="absolute top-3 -translate-x-1/2 rounded-full bg-destructive/10 px-1.5 text-[9px] font-medium text-destructive"
                style={{ left: todayOff * COL_W }}
              >
                {t("dateToday")}
              </span>
            )}
          </div>
        </div>
        <div className="flex">
          <div className="w-40 shrink-0" />
          <div
            className="relative border-l border-border/60"
            style={{ width: totalDays * COL_W, height: tasks.length * 34 }}
          >
            {todayOff >= 0 && todayOff < totalDays && (
              <div
                className="absolute top-0 z-10 h-full w-px bg-destructive/70"
                style={{ left: todayOff * COL_W }}
              />
            )}
            {tasks.map((task, idx) => {
              const off = daysBetween(rangeStart, isoDateOnly(task.startDate));
              const span = daysBetween(isoDateOnly(task.startDate), isoDateOnly(task.endDate)) + 1;
              return (
                <div
                  key={task.id}
                  className="absolute overflow-hidden whitespace-nowrap rounded-md px-1.5 text-[10px] leading-[20px] text-primary-foreground"
                  style={{
                    top: idx * 34 + 7,
                    left: off * COL_W,
                    width: Math.max(span * COL_W, 28),
                    height: 20,
                    background: barStyle[task.status as WorkStatus]?.bar ?? "#888",
                  }}
                  title={`${task.title} — ${statusLabel(task.status)}`}
                >
                  {span * COL_W > 40 ? (
                    <span className="block truncate">
                      {task.assignee ? `${task.assignee.name.slice(0, 1)} ` : ""}
                      {task.title}
                    </span>
                  ) : (
                    ""
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div className="mt-2 flex items-center gap-4 text-[10px] text-muted-foreground">
          {WORK_STATUSES.map((s) => (
            <span key={s} className="flex items-center gap-1.5">
              <span
                className={
                  "size-2 rounded-full " +
                  (barStyle[s]?.bar ?? "bg-muted")
                }
              />
              {statusLabel(s)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function KanbanView({
  tasks,
  isAdmin,
  canManage,
  onEdit,
  onDelete,
  onChangeStatus,
  isOverdue,
  fmt,
  statusLabel,
}: {
  tasks: WorkTask[];
  isAdmin: boolean;
  canManage: (task: WorkTask) => boolean;
  onEdit: (task: WorkTask) => void;
  onDelete: (task: WorkTask) => void;
  onChangeStatus: (task: WorkTask, status: string) => void;
  isOverdue: (task: WorkTask) => boolean;
  fmt: (iso: string) => string;
  statusLabel: (s: string) => string;
}) {
  const t = useTranslations("ImitationX.ChatPage");
  const selectCls =
    "h-7 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none";

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {WORK_STATUSES.map((s) => {
        const list = tasks.filter((t) => t.status === s);
        return (
          <div key={s} className="w-60 shrink-0 rounded-xl bg-muted/40 p-2">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-xs font-semibold">{statusLabel(s)}</span>
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {list.length}
              </span>
            </div>
            <div className="space-y-2">
              {list.map((task) => (
                <div
                  key={task.id}
                  className="rounded-lg border border-border/60 bg-background p-2.5 shadow-sm"
                >
                  <p className="text-sm font-medium leading-snug">
                    {task.title}
                  </p>
                  {task.description && (
                    <p className="mt-1 line-clamp-2 text-xs leading-snug text-muted-foreground">
                      {task.description}
                    </p>
                  )}
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5">
                      {task.assignee ? (
                        <>
                          <Avatar className="size-5 shrink-0">
                            <AvatarImage
                              src={task.assignee.avatar || "/default-avatar.png"}
                              alt={task.assignee.name}
                            />
                            <AvatarFallback className="text-[9px]">
                              {task.assignee.name.slice(0, 1)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="truncate text-[11px] text-muted-foreground">
                            {task.assignee.name}
                          </span>
                        </>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">—</span>
                      )}
                    </span>
                    <span
                      className={
                        "shrink-0 text-[10px] tabular-nums " +
                        (isOverdue(task)
                          ? "font-medium text-destructive"
                          : "text-muted-foreground")
                      }
                    >
                      {fmt(task.startDate)} – {fmt(task.endDate)}
                    </span>
                  </div>
                  {isOverdue(task) && (
                    <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
                      <span className="size-1 rounded-full bg-destructive" />
                      {t("overdue")}
                    </span>
                  )}
                  {canManage(task) && (
                    <div className="mt-2 flex items-center justify-between border-t border-border/50 pt-2">
                      <select
                        value={task.status}
                        onChange={(e) => onChangeStatus(task, e.target.value)}
                        className={selectCls}
                      >
                        {WORK_STATUSES.map((opt) => (
                          <option key={opt} value={opt}>
                            {statusLabel(opt)}
                          </option>
                        ))}
                      </select>
                      {isAdmin && (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 rounded-full text-muted-foreground"
                            onClick={() => onEdit(task)}
                            aria-label={t("editTask")}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 rounded-full text-destructive"
                            onClick={() => onDelete(task)}
                            aria-label={t("deleteTask")}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ListView({
  tasks,
  canManage,
  onChangeStatus,
  isOverdue,
  fmt,
  statusLabel,
  badgeStyle,
}: {
  tasks: WorkTask[];
  canManage: (task: WorkTask) => boolean;
  onChangeStatus: (task: WorkTask, status: string) => void;
  isOverdue: (task: WorkTask) => boolean;
  fmt: (iso: string) => string;
  statusLabel: (s: string) => string;
  badgeStyle: Record<WorkStatus, { badge: string }>;
}) {
  const t = useTranslations("ImitationX.ChatPage");
  const selectCls =
    "h-7 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none";
  return (
    <div className="space-y-4">
      {WORK_STATUSES.map((s) => {
        const list = tasks.filter((t) => t.status === s);
        if (list.length === 0) return null;
        return (
          <div key={s}>
            <div className="mb-1.5 flex items-center gap-2">
              <span
                className={
                  "rounded-full px-2 py-0.5 text-[11px] font-medium " +
                  badgeStyle[s].badge
                }
              >
                {statusLabel(s)}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {list.length}
              </span>
            </div>
            <div className="divide-y divide-border/60 rounded-lg border border-border/60">
              {list.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center gap-3 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{task.title}</p>
                    {task.description && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {task.description}
                      </p>
                    )}
                    <p
                      className={
                        "text-xs " +
                        (isOverdue(task)
                          ? "font-medium text-destructive"
                          : "text-muted-foreground")
                      }
                    >
                      {task.assignee ? task.assignee.name : "—"} ·{" "}
                      {fmt(task.startDate)} – {fmt(task.endDate)}
                      {isOverdue(task) && (
                        <span className="ml-1.5 rounded bg-destructive/10 px-1 py-0.5 text-[10px] font-medium">
                          {t("overdue")}
                        </span>
                      )}
                    </p>
                  </div>
                  {canManage(task) && (
                    <select
                      value={task.status}
                      onChange={(e) => onChangeStatus(task, e.target.value)}
                      className={selectCls}
                    >
                      {WORK_STATUSES.map((opt) => (
                        <option key={opt} value={opt}>
                          {statusLabel(opt)}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TableView({
  tasks,
  isAdmin,
  canManage,
  onEdit,
  onDelete,
  onChangeStatus,
  isOverdue,
  fmt,
  statusLabel,
  badgeStyle,
}: {
  tasks: WorkTask[];
  isAdmin: boolean;
  canManage: (task: WorkTask) => boolean;
  onEdit: (task: WorkTask) => void;
  onDelete: (task: WorkTask) => void;
  onChangeStatus: (task: WorkTask, status: string) => void;
  isOverdue: (task: WorkTask) => boolean;
  fmt: (iso: string) => string;
  statusLabel: (s: string) => string;
  badgeStyle: Record<WorkStatus, { badge: string }>;
}) {
  const t = useTranslations("ImitationX.ChatPage");
  const selectCls =
    "h-7 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none";
  return (
    <div className="overflow-x-auto rounded-lg border border-border/60">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-border/60 bg-muted/40 text-left text-xs text-muted-foreground">
            <th className="px-3 py-2 font-medium">{t("taskTitle")}</th>
            <th className="px-3 py-2 font-medium">{t("taskAssignee")}</th>
            <th className="px-3 py-2 font-medium">{t("taskStatus")}</th>
            <th className="px-3 py-2 font-medium">{t("taskStart")}</th>
            <th className="px-3 py-2 font-medium">{t("taskEnd")}</th>
            {isAdmin && <th className="px-3 py-2 font-medium" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {tasks.map((task) => (
            <tr key={task.id}>
              <td className="px-3 py-2">
                <p className="font-medium">{task.title}</p>
                {task.description && (
                  <p className="max-w-[240px] truncate text-xs text-muted-foreground">
                    {task.description}
                  </p>
                )}
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {task.assignee ? task.assignee.name : "—"}
              </td>
              <td className="px-3 py-2">
                {canManage(task) ? (
                  <select
                    value={task.status}
                    onChange={(e) => onChangeStatus(task, e.target.value)}
                    className={selectCls}
                  >
                    {WORK_STATUSES.map((opt) => (
                      <option key={opt} value={opt}>
                        {statusLabel(opt)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span
                    className={
                      "rounded-full px-2 py-0.5 text-[11px] font-medium " +
                      badgeStyle[task.status as WorkStatus].badge
                    }
                  >
                    {statusLabel(task.status)}
                  </span>
                )}
              </td>
              <td className="px-3 py-2 tabular-nums text-muted-foreground">
                {fmt(task.startDate)}
              </td>
              <td
                className={
                  "px-3 py-2 tabular-nums " +
                  (isOverdue(task)
                    ? "font-medium text-destructive"
                    : "text-muted-foreground")
                }
              >
                {fmt(task.endDate)}
                {isOverdue(task) && (
                  <span className="ml-1.5 rounded bg-destructive/10 px-1 py-0.5 text-[10px] font-medium">
                    {t("overdue")}
                  </span>
                )}
              </td>
              {isAdmin && (
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 rounded-full text-muted-foreground"
                      onClick={() => onEdit(task)}
                      aria-label={t("editTask")}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 rounded-full text-destructive"
                      onClick={() => onDelete(task)}
                      aria-label={t("deleteTask")}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
