import express from "express";
import OpenAI from "openai";
import { google } from "googleapis";

const app = express();
const port = process.env.PORT || 3000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const PROMPT_ID =
  "pmpt_6ab1354ce890819391882dd3f4f9426e0328cf7d87380238";

app.use(express.json());
app.use(express.static("."));

let googleAccessToken = null;
let googleAccessTokenExpiresAt = 0;

let conversationHistory = [];
const MAX_HISTORY_MESSAGES = 20;

// ===============================
// GOOGLE OAUTH
// ===============================

async function getGoogleAccessToken() {
  const now = Date.now();

  if (
    googleAccessToken &&
    now < googleAccessTokenExpiresAt - 60000
  ) {
    return googleAccessToken;
  }

  const refreshToken = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN;
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

  if (!refreshToken || !clientId || !clientSecret) {
    throw new Error("Google OAuth environment variables are missing");
  }

  const response = await fetch(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    }
  );

  const data = await response.json();

  if (!response.ok || !data.access_token) {
    console.error("GOOGLE TOKEN ERROR:", data);
    throw new Error(
      "Failed to refresh Google OAuth token"
    );
  }

  googleAccessToken = data.access_token;

  const expiresIn =
    Number(data.expires_in || 3600) * 1000;

  googleAccessTokenExpiresAt =
    Date.now() + expiresIn;

  console.log(
    "Google OAuth access token refreshed"
  );

  return googleAccessToken;
}

// ===============================
// GOOGLE CALENDAR CLIENT
// ===============================

async function getCalendarClient() {
  const accessToken =
    await getGoogleAccessToken();

  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET
  );

  auth.setCredentials({
    access_token: accessToken,
  });

  return google.calendar({
    version: "v3",
    auth,
  });
}

// ===============================
// LIST EVENTS
// ===============================

async function listCalendarEvents({
  date,
  startHour = 8,
  endHour = 18,
}) {
  const calendar =
    await getCalendarClient();

  const timeMin =
    `${date}T${String(startHour).padStart(
      2,
      "0"
    )}:00:00+02:00`;

  const timeMax =
    `${date}T${String(endHour).padStart(
      2,
      "0"
    )}:00:00+02:00`;

  const result =
    await calendar.events.list({
      calendarId: "primary",
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: "startTime",
    });

  return result.data.items || [];
}

// ===============================
// CREATE EVENT
// ===============================

async function createCalendarEvent({
  name,
  service,
  date,
  time,
}) {
  const calendar =
    await getCalendarClient();

  const startDateTime =
    `${date}T${time}:00+02:00`;

  const [hour, minute] =
    time.split(":").map(Number);

  const endHour = hour + 1;

  const endDateTime =
    `${date}T${String(endHour).padStart(
      2,
      "0"
    )}:${String(minute).padStart(
      2,
      "0"
    )}:00+02:00`;

  const event = {
    summary:
      `Дантист — ${service} — ${name}`,

    description:
      `Пациент: ${name}\nУслуга: ${service}`,

    start: {
      dateTime: startDateTime,
      timeZone: "Europe/Warsaw",
    },

    end: {
      dateTime: endDateTime,
      timeZone: "Europe/Warsaw",
    },
  };

  const result =
    await calendar.events.insert({
      calendarId: "primary",
      requestBody: event,
    });

  console.log(
    "CALENDAR EVENT CREATED:",
    result.data.id
  );

  return result.data;
}

// ===============================
// CALENDAR TOOLS FOR OPENAI
// ===============================

const calendarTools = [
  {
    type: "function",
    name: "check_calendar",
    description:
      "Проверяет занятость Google Calendar клиники на указанную дату и возвращает существующие записи.",
    parameters: {
      type: "object",
      properties: {
        date: {
          type: "string",
          description:
            "Дата в формате YYYY-MM-DD",
        },
      },
      required: ["date"],
      additionalProperties: false,
    },
    strict: true,
  },

  {
    type: "function",
    name: "book_patient",
    description:
      "Создаёт запись пациента непосредственно в Google Calendar клиники. Использовать только когда пациент подтвердил конкретную дату и время.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Имя пациента",
        },
        service: {
          type: "string",
          description:
            "Услуга стоматологии",
        },
        date: {
          type: "string",
          description:
            "Дата в формате YYYY-MM-DD",
        },
        time: {
          type: "string",
          description:
            "Время в формате HH:MM",
        },
      },
      required: [
        "name",
        "service",
        "date",
        "time",
      ],
      additionalProperties: false,
    },
    strict: true,
  },
];

// ===============================
// EXECUTE CALENDAR TOOL
// ===============================

async function executeCalendarTool(
  name,
  args
) {
  if (name === "check_calendar") {
    const events =
      await listCalendarEvents({
        date: args.date,
      });

    return {
      success: true,
      date: args.date,
      events: events.map((event) => ({
        id: event.id,
        summary: event.summary || "",
        start:
          event.start?.dateTime ||
          event.start?.date ||
          null,
        end:
          event.end?.dateTime ||
          event.end?.date ||
          null,
      })),
    };
  }

  if (name === "book_patient") {
    const event =
      await createCalendarEvent(args);

    return {
      success: true,
      eventId: event.id,
      htmlLink: event.htmlLink || null,
      message:
        "Запись успешно создана в Google Calendar.",
    };
  }

  throw new Error(
    `Unknown calendar tool: ${name}`
  );
}

// ===============================
// CHAT
// ===============================

app.post("/api/chat", async (req, res) => {
  try {
    const message = String(
      req.body?.message || ""
    ).trim();

    if (!message) {
      return res.status(400).json({
        reply: "Напишите сообщение.",
      });
    }

    console.log("");
    console.log("===============================");
    console.log("USER MESSAGE:", message);
    console.log("===============================");

    conversationHistory.push({
      role: "user",
      content: message,
    });

    if (
      conversationHistory.length >
      MAX_HISTORY_MESSAGES
    ) {
      conversationHistory =
        conversationHistory.slice(
          -MAX_HISTORY_MESSAGES
        );
    }

    let response =
      await openai.responses.create({
        model: "gpt-5.6-luna",

        prompt: {
          id: PROMPT_ID,
        },

        input: conversationHistory,

        tools: calendarTools,

        max_output_tokens: 500,

        reasoning: {
          effort: "low",
        },

        text: {
          verbosity: "low",
        },

        prompt_cache_key:
          "dantist-ai-clinic",

        tool_choice: "auto",
      });

    // OpenAI может попросить выполнить
    // одну или несколько функций.
    while (true) {
      const functionCalls =
        response.output.filter(
          (item) =>
            item.type ===
            "function_call"
        );

      if (
        functionCalls.length === 0
      ) {
        break;
      }

      const toolOutputs = [];

      for (const call of functionCalls) {
        console.log(
          "OPENAI TOOL:",
          call.name
        );

        console.log(
          "TOOL ARGUMENTS:",
          call.arguments
        );

        try {
          const args =
            JSON.parse(call.arguments);

          const result =
            await executeCalendarTool(
              call.name,
              args
            );

          console.log(
            "CALENDAR RESULT:",
            JSON.stringify(
              result,
              null,
              2
            )
          );

          toolOutputs.push({
            type:
              "function_call_output",

            call_id:
              call.call_id,

            output:
              JSON.stringify(result),
          });
        } catch (toolError) {
          console.error(
            "CALENDAR TOOL ERROR:",
            toolError
          );

          toolOutputs.push({
            type:
              "function_call_output",

            call_id:
              call.call_id,

            output: JSON.stringify({
              success: false,
              error:
                toolError.message,
            }),
          });
        }
      }

      response =
        await openai.responses.create({
          model: "gpt-5.6-luna",

          prompt: {
            id: PROMPT_ID,
          },

          input: [
            ...conversationHistory,
            ...response.output,
            ...toolOutputs,
          ],

          tools: calendarTools,

          max_output_tokens: 500,

          reasoning: {
            effort: "low",
          },

          text: {
            verbosity: "low",
          },

          prompt_cache_key:
            "dantist-ai-clinic",

          tool_choice: "auto",
        });
    }

    const reply =
      response.output_text ||
      "Извините, не удалось сформировать ответ.";

    console.log(
      "ASSISTANT REPLY:",
      reply
    );

    conversationHistory.push({
      role: "assistant",
      content: reply,
    });

    if (
      conversationHistory.length >
      MAX_HISTORY_MESSAGES
    ) {
      conversationHistory =
        conversationHistory.slice(
          -MAX_HISTORY_MESSAGES
        );
    }

    return res.json({
      reply,
    });
  } catch (error) {
    console.error(
      "OPENAI/CALENDAR ERROR:",
      error
    );

    if (error?.status === 429) {
      return res.status(429).json({
        reply:
          "Сервис временно недоступен из-за ограничения OpenAI API.",
      });
    }

    return res.status(500).json({
      reply:
        "Произошла ошибка сервера. Проверьте настройки OpenAI и Google Calendar.",
    });
  }
});

// ===============================
// HEALTH
// ===============================

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "dantist-ai",
  });
});

app.listen(port, () => {
  console.log(
    `Дантист запущен на порту ${port}`
  );
});
