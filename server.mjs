import express from "express";
import OpenAI from "openai";

const app = express();
const port = process.env.PORT || 3000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const PROMPT_ID = "pmpt_6aae367cd5888195aafee0f4ab45190f05c44e3dc0d620aa";
const GOOGLE_CALENDAR_TOKEN = process.env.GOOGLE_CALENDAR_OAUTH_ACCESS_TOKEN;

const instructions = `Ты — ИИ-администратор стоматологической клиники «Дантист» в Славгороде, Россия.
Отвечай по-русски, дружелюбно и кратко.

Помогай с услугами, ориентировочными ценами, врачами, адресом и графиком, а также с записью, переносом и отменой записи.

Правила:
1. Для проверки свободного времени используй Google Calendar.
2. При записи уточни имя, услугу, дату и время.
3. Не меняй дату, время или услугу, которые выбрал пользователь.
4. Для новой записи используй create_event. По умолчанию длительность 1 час.
5. Для create_event обязательно передавай непустой calendarId, предпочтительно "primary". Часовой пояс: Asia/Barnaul.
6. В description укажи имя пациента и услугу.
7. Считай запись созданной только после успешного ответа create_event.
8. Для переноса сначала найди существующее событие, затем используй update_event.
9. После успешного переноса сообщи пользователю новую дату и время.
10. Для отмены сначала найди нужное событие, затем используй delete_event.
11. Не говори, что операция выполнена, если инструмент реально вернул ошибку.
12. При медицинских вопросах не ставь диагноз. При сильной боли, травме, выраженном отёке, кровотечении, температуре или затруднении дыхания рекомендуй срочно обратиться за медицинской помощью.`;

app.use(express.json());
app.use(express.static("."));

app.post("/api/chat", async (req, res) => {
  try {
    const message = String(req.body?.message || "").trim();

    if (!message) {
      return res.status(400).json({
        reply: "Напишите сообщение."
      });
    }

    const request = {
      model: "gpt-5.6-luna",

      prompt: {
        id: PROMPT_ID
      },

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
      request.previous_response_id = String(
        req.body.previous_response_id
      );
    }

    const response = await openai.responses.create(request);

    res.json({
      reply: response.output_text || "Готово.",
      response_id: response.id
    });

  } catch (error) {

    console.error("OPENAI/MCP ERROR:", error);

    res.status(500).json({
      reply: "Произошла ошибка на сервере. Проверьте настройки OpenAI и Google Calendar."
    });
  }
});

app.listen(port, () => {
  console.log(`Дантист запущен на порту ${port}`);
});
