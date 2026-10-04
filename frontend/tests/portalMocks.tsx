import type { ConversationDetail } from "../src/types/chat";
import { caseFixture, installMockApi, json, timestamp } from "./fixtures";

export function installPortalMockApi() {
  const mock = installMockApi();
  const original = mock.fetchMock.getMockImplementation()!;
  let conversation: ConversationDetail | undefined;
  const chatPosts: {
    path: string;
    body: Record<string, unknown>;
    headers: HeadersInit | undefined;
  }[] = [];

  mock.fetchMock.mockImplementation(async (input, init) => {
    const path = String(input);
    if (
      /^\/api\/(households|providers)\/[^/]+\/service-(schedules|reminders)\?/.test(
        path,
      )
    )
      return json([]);
    if (path === "/api/providers")
      return json([
        {
          id: "P-01",
          name: "Demo provider one",
          trade: "water_purifier",
          status: "available",
          created_at: timestamp,
        },
        {
          id: "P-02",
          name: "Demo provider two",
          trade: "appliance_service",
          status: "available",
          created_at: timestamp,
        },
      ]);
    if (path === "/api/providers/P-01/queue") return json([mock.state.item]);
    if (path === "/api/providers/P-02/queue") return json([]);
    if (path === "/api/chat/conversations?household_id=HH-01")
      return json(conversation ? [conversation] : []);
    if (path === "/api/chat/conversations" && init?.method === "POST") {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      chatPosts.push({ path, body, headers: init.headers });
      conversation = {
        id: "CHAT-01",
        household_id: String(body.household_id),
        case_id: null,
        asset_id: null,
        draft_complaint: null,
        stage: "ready",
        status: "open",
        created_at: timestamp,
        updated_at: timestamp,
        messages: [],
      };
      return json(conversation, 201);
    }
    if (path === "/api/chat/conversations/CHAT-01" && conversation)
      return json(conversation);
    if (
      path === "/api/chat/conversations/CHAT-01/messages" &&
      init?.method === "POST" &&
      conversation
    ) {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      chatPosts.push({ path, body, headers: init.headers });
      if (body.action === "confirm_report") {
        conversation = {
          ...conversation,
          case_id: caseFixture.id,
          stage: "case_active",
        };
      } else if (body.action === "cancel_report") {
        conversation = {
          ...conversation,
          asset_id: null,
          draft_complaint: null,
          stage: "ready",
        };
      } else if (body.asset_id) {
        conversation = {
          ...conversation,
          asset_id: String(body.asset_id),
          stage: "await_problem",
        };
      } else {
        conversation = {
          ...conversation,
          draft_complaint: String(body.text),
          stage: "confirm_report",
          messages: [
            ...conversation.messages,
            {
              id: `MSG-${conversation.messages.length + 1}`,
              conversation_id: conversation.id,
              role: "customer",
              content: String(body.text),
              truth_label: "REAL_HUMAN_INPUT",
              created_at: timestamp,
            },
          ],
        };
      }
      return json(conversation);
    }
    return original(input, init);
  });
  return { ...mock, chatPosts };
}
