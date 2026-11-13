import type Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { anthropic, MODEL, USER_CONTEXT } from "@/lib/ai";
import { runTool, TOOLS } from "@/lib/ai-tools";

export const maxDuration = 120;

type ChatMsg = { role: "user" | "assistant"; content: string };

/**
 * Agent loop: Claude calls read-only tools against Supabase until it has an answer.
 * Streams newline-delimited JSON events: {type:"tool", name} | {type:"text", text} | {type:"error", error}.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return new Response("unauthorized", { status: 401 });

  const { messages } = (await req.json()) as { messages: ChatMsg[] };
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Denver" });

  const system = `You are a sharp, candid personal finance analyst inside the user's private finance app.
Today is ${today}. Currency is USD.${USER_CONTEXT ? `\nAbout the user: ${USER_CONTEXT}` : ""}
- Always ground answers in the user's actual data by calling tools; never guess numbers.
- Amounts: negative = money out, positive = money in. Transfers and credit-card payments are not spending.
- Data comes from SimpleFIN and covers roughly the last 90 days from the first sync onward; say so if a question needs older data.
- Be concise: lead with the answer, then the few numbers that support it. Use short markdown tables when comparing several items.
- When you spot something notable (a spike, a duplicate charge, a forgotten subscription), mention it briefly.
- You are not a licensed financial advisor; for investment or tax decisions, give the facts and trade-offs rather than directives.`;

  const convo: Anthropic.Messages.MessageParam[] = messages
    .filter((m) => m.content?.trim())
    .slice(-20)
    .map((m) => ({ role: m.role, content: m.content }));

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      try {
        for (let step = 0; step < 8; step++) {
          const s = anthropic().messages.stream({
            model: MODEL,
            max_tokens: 2500,
            system,
            tools: TOOLS,
            messages: convo,
          });
          s.on("text", (t) => send({ type: "text", text: t }));
          const msg = await s.finalMessage();
          convo.push({ role: "assistant", content: msg.content });

          if (msg.stop_reason !== "tool_use") break;

          const results: Anthropic.Messages.ToolResultBlockParam[] = [];
          for (const block of msg.content) {
            if (block.type !== "tool_use") continue;
            send({ type: "tool", name: block.name });
            try {
              const out = await runTool(supabase, block.name, block.input as Record<string, unknown>);
              results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(out) });
            } catch (e) {
              results.push({
                type: "tool_result",
                tool_use_id: block.id,
                content: `Error: ${e instanceof Error ? e.message : String(e)}`,
                is_error: true,
              });
            }
          }
          convo.push({ role: "user", content: results });
          send({ type: "text", text: "\n\n" });
        }
      } catch (e) {
        send({ type: "error", error: e instanceof Error ? e.message : String(e) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8" } });
}
