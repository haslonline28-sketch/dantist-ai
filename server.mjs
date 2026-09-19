import express from "express";
import OpenAI from "openai";

const app = express();
const port = process.env.PORT || 3000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const PROMPT_ID =
  "pmpt_6aae367cd5888195aafee0f4ab45190f05c44e3dc0d620aa";

const GOOGLE_CALENDAR_TOKEN =
  process.env.GOOGLE_CALENDAR_OAUTH_ACCESS_TOKEN;

app.use(express.json());
app.use(express.static("."));

app.post("/api/chat", async (req, res) => {
  try {
    const message = String(req.body?.message || "").trim();

    if (!message) {
      return res.status(400).json({
        reply: "Напишите сообщение.",
      });
    }

    const request = {
      model: "gpt-5.6-luna",

      prompt: {
        id: PROMPT_ID,
      },

      input: message,

      // Не даём одному ответу разрастаться.
      // Лимит включает и видимый ответ, и reasoning-токены.
      max_output_tokens: 1000,

      // Для типовых административных задач клиники
      // достаточно низкого уровня рассуждений.
      reasoning: {
        effort: "low",
      },

      // Делаем ответы короче.
      text: {
        verbosity: "low",
      },

      // Помогает повторно использовать одинаковый префикс.
      prompt_cache_key: "dantist-ai-clinic",

      tools: [
        {
          type: "mcp",
          server_label: "google_calendar",
          server_url:
            "https://calendarmcp.googleapis.com/mcp/v1",
          authorization: GOOGLE_CALENDAR_TOKEN,

          // Оставляем только нужные операции.
          allowed_tools: [
            "list_events",
            "get_event",
            "create_event",
            "update_event",
            "delete_event",
          ],

          require_approval: "never",
        },
      ],

      // Защита от лишних циклов вызова инструментов.
      max_tool_calls: 3,
    };

    if (req.body?.previous_response_id) {
      request.previous_response_id = String(
        req.body.previous_response_id
      );
    }

    const response =
      await openai.responses.create(request);

    res.json({
      reply: response.output_text || "Готово.",
      response_id: response.id,
    });
  } catch (error) {
    console.error("OPENAI/MCP ERROR:", error);

    res.status(500).json({
      reply:
        "Произошла ошибка на сервере. Попробуйте ещё раз.",
    });
  }
});

app.listen(port, () => {
  console.log(`Дантист запущен на порту ${port}`);
});
