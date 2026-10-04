import { request } from "./api";
import type {
  ConversationDetail,
  ConversationSummary,
  CustomerSend,
} from "../types/chat";

const conversationPath = (id: string) =>
  `/chat/conversations/${encodeURIComponent(id)}`;

export const chatApi = {
  conversations: (householdId: string) =>
    request<ConversationSummary[]>(
      `/chat/conversations?household_id=${encodeURIComponent(householdId)}`,
    ),
  createConversation: (householdId: string) =>
    request<ConversationDetail>("/chat/conversations", {
      household_id: householdId,
    }),
  conversation: (id: string) =>
    request<ConversationDetail>(conversationPath(id)),
  send: (id: string, body: CustomerSend) =>
    request<ConversationDetail>(`${conversationPath(id)}/messages`, body),
};
