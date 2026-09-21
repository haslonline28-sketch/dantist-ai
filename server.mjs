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


// Определяем, нужен ли пользователю Google Calendar
function needsCalendar(message) {
  const text = message.toLowerCase();

  return /запис|записаться|запиши|приём|прием|стоматолог|врач|лечение|чистк|удалени|пломб|свободн|окн|врем|дата|перенес|перенести|отмен|отменить|календар|запись|приём|прием/i.test(
    text
  );
}


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

      max_output_tokens: 700,

      reasoning: {
        effort: "low",
      },

      text: {
        verbosity: "low",
      },

      prompt_cache_key: "dantist-ai-clinic",

      max_tool_calls: 3,
    };


    // Google Calendar подключаем только когда он действительно нужен
    if (needsCalendar(message)) {
      request.tools = [
        {
          type: "mcp",
          server_label: "google_calendar",
          connector_id: "connector_googlecalendar",
          authorization: GOOGLE_CALENDAR_TOKEN,
          require_approval: "never",
        },
      ];
    }


    // Продолжаем предыдущий диалог, если он есть
    if (req.body?.previous_response_id) {
      request.previous_response_id = String(
        req.body.previous_response_id
      );
    }


    const response = await openai.responses.create(request);


    res.json({
      reply:
        response.output_text ||
        "Извините, не удалось сформировать ответ.",
      response_id: response.id,
    });

  } catch (error) {

    console.error("OPENAI/MCP ERROR:", error);

    const status = error?.status || 500;

    // Не показываем пользователю технические подробности
    if (status === 429) {
      return res.status(429).json({
        reply:
          "Сервис временно перегружен. Попробуйте ещё раз немного позже.",
      });
    }

    res.status(500).json({
      reply:
        "Произошла ошибка на сервере. Попробуйте ещё раз.",
    });
  }
});


app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "dantist-ai",
  });
});


app.listen(port, () => {
  console.log(`Дантист запущен на порту ${port}`);
});
