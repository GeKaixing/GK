export interface GroupMember {
  id: string;
  name: string;
  avatar: string | null;
  userid: string;
  role: string;
  mutedAt: string | null;
  joinedAt: string;
}

export interface WorkTask {
  id: string;
  title: string;
  description: string | null;
  assigneeId: string | null;
  status: string;
  startDate: string;
  endDate: string;
  assignee: { id: string; name: string; avatar: string | null } | null;
}

export interface GroupInfo {
  id: string;
  name: string;
  avatar: string | null;
  isGroup: boolean;
  participantCount: number;
  createdAt: string;
  callerRole: string;
}

export type WorkStatus = "planned" | "in_progress" | "done";

export const WORK_STATUSES: WorkStatus[] = ["planned", "in_progress", "done"];
