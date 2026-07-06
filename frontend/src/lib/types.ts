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
  document_count: number;
}

export interface NamedConfig {
  id: string;
  name: string;
  content: string;
  is_active: boolean;
  updated_at: string;
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

export interface McpHeader {
  name: string;
  is_secret: boolean;
  value?: string | null;
  value_hint?: string | null;
}

export interface McpTool {
  name: string;
  description: string;
}

export interface McpServer {
  id: string;
  name: string;
  slug: string;
  transport: "sse" | "http";
  url: string;
  headers: McpHeader[];
  status: string; // unknown | connected | failed
  last_checked_at: string | null;
  last_error: string | null;
  tools: McpTool[];
  is_enabled: boolean;
}

export interface RunSummary {
  model: string;
  duration_ms: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  total_cost_usd: number | null;
  num_turns: number | null;
  tool_calls: number;
  version_no?: number;
}

export interface TermLine {
  kind: string; // info | tool | mcp | text | done | error
  text: string;
  ts?: string;
}

export interface AppSettings {
  anthropic_key_set: boolean;
  anthropic_key_hint: string | null;
  anthropic_status: string;   // unknown | connected | failed
  anthropic_checked_at: string | null;
  anthropic_error: string | null;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_pass_set: boolean;
  smtp_from: string;
  smtp_status: string;
  smtp_checked_at: string | null;
  smtp_error: string | null;
}

