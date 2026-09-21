import express from "express";
import OpenAI from "openai";

const app = express();
const port = process.env.PORT || 3000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const PROMPT_ID =
  "pmpt_6aae367cd5888195aafee0f4ab45190f05c44e3dc0d620aa";

app.use(express.json());
app.use(express.static("."));

let googleAccessToken = null;
let googleAccessTokenExpiresAt = 0;

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
    console.error(
      "GOOGLE TOKEN ERROR:",
      data
    );

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
  const text = message.toLowerCase();

  return /запис|записаться|запиши|приём|прием|стоматолог|врач|лечение|чистк|удалени|пломб|свободн|окн|врем|дата|перенес|перенести|отмен|отменить|календар|запись/i.test(
    text
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

    console.log(
      "USER MESSAGE:",
      message
    );

    const request = {
      model: "gpt-5.6-luna",

      prompt: {
        id: PROMPT_ID,
      },

      input: message,

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

    if (needsCalendar(message)) {
      console.log(
        "CALENDAR: connecting Google Calendar"
      );

      const googleAccessToken =
        await getGoogleAccessToken();

      request.tools = [
        {
          type: "mcp",
          server_label:
            "google_calendar",
          connector_id:
            "connector_googlecalendar",
          authorization:
            googleAccessToken,
          require_approval:
            "never",
        },
      ];
    }

    const response =
      await openai.responses.create(
        request
      );

    console.log(
      "OPENAI USAGE:",
      response.usage || "usage unavailable"
    );

    console.log(
      "OPENAI RESPONSE ID:",
      response.id
    );

    return res.json({
      reply:
        response.output_text ||
        "Извините, не удалось сформировать ответ.",
    });

  } catch (error) {
    console.error(
      "OPENAI/MCP ERROR:",
      error
    );

    const status =
      error?.status || 500;

    if (status === 429) {
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
  );

app.listen(port, () => {
  console.log(
    `Дантист запущен на порту ${port}`
  );
});}
