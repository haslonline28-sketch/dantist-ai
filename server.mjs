import express from "express";
import OpenAI from "openai";

const app = express();
const port = process.env.PORT || 3000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const PROMPT_ID = "pmpt_6aae367cd5888195aafee0f4ab45190f05c44e3dc0d620aa";
const GOOGLE_CALENDAR_TOKEN = process.env.GOOGLE_CALENDAR_OAUTH_ACCESS_TOKEN;

if (!process.env.OPENAI_API_KEY) {
  console.warn("OPENAI_API_KEY is not set.");
}
if (!GOOGLE_CALENDAR_TOKEN) {
  console.warn("GOOGLE_CALENDAR_OAUTH_ACCESS_TOKEN is not set.");
}

app.use(express.json());
app.use(express.static("."));

app.post("/api/chat", async (req, res) => {
  try {
    const message = String(req.body?.message || "").trim();
    if (!message) {
      return res.status(400).json({ error: "Пустое сообщение." });
    }

    const request = {
      model: "gpt-5.6-luna",
      prompt: { id: PROMPT_ID },
      input: message,
      tools: [
        {
          type: "mcp",
          server_label: "google_calendar",
          server_url: "https://calendarmcp.googleapis.com/mcp/v1",
          authorization: GOOGLE_CALENDAR_TOKEN,
          allowed_tools: [
            "list_events",
            "get_event",
            "list_calendars",
            "suggest_time",
            "create_event",
            "update_event",
            "delete_event",
            "respond_to_event",
            "search_events"
          ],
          require_approval: "never"
        }
      ]
    };

    if (req.body?.previous_response_id) {
      request.previous_response_id = String(req.body.previous_response_id);
    }

    const response = await openai.responses.create(request);

    return res.json({
      reply: response.output_text || "Не удалось получить текстовый ответ.",
      response_id: response.id
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      reply: "Произошла ошибка на сервере. Проверьте настройки OpenAI и Google Calendar.",
      error: error?.message || "Unknown error"
    });
  }
});

app.listen(port, () => {
  console.log(`Дантист запущен на порту ${port}`);
});
