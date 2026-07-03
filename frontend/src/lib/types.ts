export type Role = "user" | "admin";

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  status: string;
  created_at: string;
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  created_by: string;
  created_at: string;
  srs_status: "none" | "generating" | "generated" | "stale";
  host_sync_status: "not_sent" | "synced" | "out_of_date";
  current_version_no: number | null;
  active_job_id: string | null;
}

export interface DocumentItem {
  id: string;
  original_filename: string;
  category: string;
  mime_type: string;
  size_bytes: number;
  uploaded_at: string;
}

export interface SrsVersion {
  id: string;
  version_no: number;
  model_id: string;
  created_at: string;
  host_sync_status: string;
  host_synced_at: string | null;
}

export interface ProjectDetail extends Project {
  documents: DocumentItem[];
  versions: SrsVersion[];
}

export interface LlmModel {
  id: string;
  model_id: string;
  display_name: string;
  description: string;
  is_enabled: boolean;
  is_default: boolean;
  sort_order: number;
}

export interface Job {
  id: string;
  project_id: string;
  status: string;
  phase: string;
  percent: number;
  current_activity: string;
  error_message: string | null;
  model_id: string;
  is_regeneration: boolean;
}

export interface AgentTool {
  id: string;
  tool_key: string;
  display_name: string;
  description: string;
  is_enabled: boolean;
  sort_order: number;
}

export interface PromptVersion {
  id: string;
  content: string;
  version_no: number;
  is_active: boolean;
  updated_at: string;
}
