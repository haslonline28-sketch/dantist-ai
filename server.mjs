import express from "express";
import OpenAI from "openai";
import crypto from "crypto";

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

/*
  Простое хранение истории диалогов.

  Каждый посетитель получает свой session ID через cookie.
  История хранится в памяти Render.
*/
const sessions = new Map();

const MAX_HISTORY_MESSAGES = 20;

function getSessionId(req, res) {
  const cookies = req.headers.cookie || "";

  const match = cookies.match(
    /(?:^|;\s*)dantist_session=([^;]+)/
  );

  if (match && match[1]) {
    return match[1];
  }

  const sessionId = crypto.randomUUID();

  res.setHeader(
    "Set-Cookie",
    `dantist_session=${sessionId}; Path=/; HttpOnly; SameSite=Lax`
  );

  return sessionId;
}

function getSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      history: [],
      calendarActive: false,
    });
  }

  return sessions.get(sessionId);
}

async function getGoogleAccessToken() {
  const now = Date.now();

  if (
    googleAccessToken &&
    now < googleAccessTokenExpiresAt - 60000
  ) {
    return googleAccessToken;
  }

  const refreshToken =
    process.env.GOOGLE_CALENDAR_REFRESH_TOKEN;

  const clientId =
    process.env.GOOGLE_OAUTH_CLIENT_ID;

  const clientSecret =
    process.env.GOOGLE_OAUTH_CLIENT_SECRET;

  if (!refreshToken || !clientId || !clientSecret) {
    throw new Error(
      "Google OAuth environment variables are missing"
    );
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

function needsCalendar(message) {
  return /запис|записаться|запиши|приём|прием|стоматолог|врач|лечение|чистк|удалени|пломб|свободн|окн|врем|дата|перенес|перенести|отмен|отменить|календар|запись|\b\d{1,2}[:.]\d{2}\b/i.test(
    message.toLowerCase()
  );
}

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

    const sessionId = getSessionId(req, res);
    const session = getSession(sessionId);

    console.log("USER MESSAGE:", message);
    console.log(
      "SESSION:",
      sessionId
    );

    /*
      Если разговор уже связан с записью,
      продолжаем использовать Google Calendar
      даже если пользователь написал просто "9:00".
    */
    if (needsCalendar(message)) {
      session.calendarActive = true;
    }

    /*
      Добавляем сообщение пациента в историю.
    */
    session.history.push({
      role: "user",
      content: message,
    });

    /*
      Ограничиваем историю, чтобы запросы
      не становились слишком большими.
    */
    if (
      session.history.length >
      MAX_HISTORY_MESSAGES
    ) {
      session.history =
        session.history.slice(
          -MAX_HISTORY_MESSAGES
        );
    }

    const request = {
      model: "gpt-5.6-luna",

      prompt: {
        id: PROMPT_ID,
      },

      input: session.history,

      max_output_tokens: 400,

      reasoning: {
        effort: "low",
      },

      text: {
        verbosity: "low",
      },

      prompt_cache_key:
        "dantist-ai-clinic",

      max_tool_calls: 1,
    };

    /*
      Если пользователь находится в сценарии записи,
      подключаем Google Calendar.
    */
    if (session.calendarActive) {
      console.log(
        "CALENDAR: connecting Google Calendar"
      );

      const accessToken =
        await getGoogleAccessToken();

      request.tools = [
        {
          type: "mcp",
          server_label: "google_calendar",
          connector_id:
            "connector_googlecalendar",
          authorization: accessToken,
          require_approval: "never",
        },
      ];
    }

    const response =
      await openai.responses.create(request);

    console.log(
      "OPENAI USAGE:",
      response.usage || "usage unavailable"
    );

    console.log(
      "OPENAI RESPONSE ID:",
      response.id
    );

    const reply =
      response.output_text ||
      "Извините, не удалось сформировать ответ.";

    /*
      Сохраняем ответ ассистента в историю,
      чтобы следующий вопрос видел контекст.
    */
    session.history.push({
      role: "assistant",
      content: reply,
    });

    if (
      session.history.length >
      MAX_HISTORY_MESSAGES
    ) {
      session.history =
        session.history.slice(
          -MAX_HISTORY_MESSAGES
        );
    }

    return res.json({
      reply,
    });
  } catch (error) {
    console.error(
      "OPENAI/MCP ERROR:",
      error
    );

    if (error?.status === 429) {
      return res.status(429).json({
        reply:
          "Сервис временно перегружен. Попробуйте ещё раз немного позже.",
      });
    }

    return res.status(500).json({
      reply:
        "Произошла ошибка сервера. Попробуйте ещё раз.",
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
  console.log(
    `Дантист запущен на порту ${port}`
  );
});
