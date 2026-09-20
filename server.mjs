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

      // Ваш опубликованный Prompt
      prompt: {
        id: PROMPT_ID,
      },

      input: message,

      // Ограничиваем максимальный размер ответа
      // для снижения расхода токенов.
      max_output_tokens: 1000,

      // Для административных задач клиники
      // достаточно небольшого уровня рассуждений.
      reasoning: {
        effort: "low",
      },

      // Ответы пациентам делаем короткими.
      text: {
        verbosity: "low",
      },

      // Стабильный ключ для prompt caching.
      prompt_cache_key: "dantist-ai-clinic",

      tools: [
        {
          type: "mcp",

          // Google Calendar через официальный OpenAI connector
          server_label: "google_calendar",

          connector_id: "connector_googlecalendar",

          // OAuth-токен хранится только в Render
          authorization: GOOGLE_CALENDAR_TOKEN,

          // Только нужные действия календаря
          allowed_tools: [
            "list_events",
            "get_event",
            "create_event",
            "update_event",
            "delete_event",
          ],

          // Для нашего серверного демо не спрашиваем
          // отдельное подтверждение каждого действия.
          require_approval: "never",
        },
      ],

      // Не позволяем модели делать бесконечную цепочку
      // вызовов инструментов.
      max_tool_calls: 3,
    };

    // Продолжаем текущий диалог.
    if (req.body?.previous_response_id) {
      request.previous_response_id = String(
        req.body.previous_response_id
      );
    }

    const response = await openai.responses.create(request);

    res.json({
      reply: response.output_text || "Готово.",
      response_id: response.id,
    });

  } catch (error) {
    console.error("OPENAI/MCP ERROR:", error);

    res.status(500).json({
      reply: "Произошла ошибка на сервере. Попробуйте ещё раз.",
    });
  }
});

app.listen(port, () => {
  console.log(`Дантист запущен на порту ${port}`);
});
