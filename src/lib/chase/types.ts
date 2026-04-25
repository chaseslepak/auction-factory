export type ChaseRole = 'owner' | 'admin' | 'team_member' | 'client';
export type TaskPriority = 'low' | 'normal' | 'high' | 'critical';
export type TaskUrgency = 'whenever' | 'this_week' | 'today' | 'now';
export type TaskStatus = 'inbox' | 'triaged' | 'in_progress' | 'blocked' | 'done' | 'archived';
export type CommandQueueStatus = 'pending' | 'snoozed' | 'done' | 'dismissed';
export type DealStage = 'lead' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost';
export type DecisionStatus = 'pending' | 'approved' | 'rejected' | 'deferred';

export type Profile = {
  id: string;
  display_name: string;
  email: string;
  role: ChaseRole;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

export type Company = {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  status: string;
  notes: string | null;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
};

export type Person = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role_title: string | null;
  company_id: string | null;
  owner_id: string | null;
  notes: string | null;
};

export type Task = {
  id: string;
  title: string;
  description: string | null;
  company_id: string | null;
  submitted_by: string;
  assigned_to: string | null;
  priority: TaskPriority;
  urgency: TaskUrgency;
  due_date: string | null;
  status: TaskStatus;
  what_is_needed_from_chase: string | null;
  client_visible: boolean;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type TaskComment = {
  id: string;
  task_id: string;
  author_id: string;
  body: string;
  created_at: string;
};

export type TaskAttachment = {
  id: string;
  task_id: string;
  uploaded_by: string;
  storage_path: string;
  filename: string;
  size_bytes: number | null;
  mime_type: string | null;
  created_at: string;
};

export type Decision = {
  id: string;
  title: string;
  context: string | null;
  options: Array<{ option: string; pros?: string[]; cons?: string[] }>;
  recommendation: string | null;
  status: DecisionStatus;
  decided_by: string | null;
  company_id: string | null;
  client_visible: boolean;
  due_date: string | null;
  decided_at: string | null;
};

export type Deal = {
  id: string;
  company_id: string | null;
  name: string;
  value_cents: number;
  stage: DealStage;
  probability: number;
  expected_close_date: string | null;
  owner_id: string | null;
  notes: string | null;
};

export type CommandQueueItem = {
  id: string;
  title: string;
  body: string | null;
  source_type: string | null;
  source_id: string | null;
  status: CommandQueueStatus;
  assigned_to: string | null;
  snooze_until: string | null;
  created_at: string;
  completed_at: string | null;
};

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  critical: 'Critical',
};

export const URGENCY_LABEL: Record<TaskUrgency, string> = {
  whenever: 'Whenever',
  this_week: 'This week',
  today: 'Today',
  now: 'Now',
};

export const STATUS_LABEL: Record<TaskStatus, string> = {
  inbox: 'Inbox',
  triaged: 'Triaged',
  in_progress: 'In progress',
  blocked: 'Blocked',
  done: 'Done',
  archived: 'Archived',
};
