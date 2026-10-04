import type { TruthLabel } from "./api";

export type CustomerChatAction = "message" | "confirm_report" | "cancel_report";

export interface CustomerSend {
  text: string;
  asset_id?: string;
  action?: CustomerChatAction;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  role: "customer" | "provider" | "assistant";
  content: string;
  truth_label: TruthLabel;
  created_at: string;
}

export interface ConversationSummary {
  id: string;
  household_id: string;
  case_id: string | null;
  asset_id: string | null;
  draft_complaint: string | null;
  stage: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface ConversationDetail extends ConversationSummary {
  messages: ChatMessage[];
}
