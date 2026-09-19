import express from "express";
import OpenAI from "openai";
import crypto from "node:crypto";

const app = express();
const port = process.env.PORT || 3000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const PROMPT_ID =
  "pmpt_6aae367cd5888195aafee0f4ab45190f05c44e3dc0d620aa";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;

const REDIRECT_URI =
  "https://dantist-ai.onrender.com/auth/google/callback";

const GOOGLE_SCOPE =
  "https://www.googleapis.com/auth/calendar.events";

let oauthState = null;
let cachedAccessToken = null;
let accessTokenExpiresAt = 0;

app.use(express.json());
app.use(express.static("."));

/* -----------------------------
   GOOGLE OAUTH
----------------------------- */

app.get("/auth/google", (req, res) => {
  oauthState = crypto.randomBytes(24).toString("hex");

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    scope: GOOGLE_SCOPE,
    state: oauthState,
  });

  res.redirect(
    "https://accounts.google.com/o/oauth2/v2/auth?" +
      params.toString()
  );
});

app.get("/auth/google/callback", async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code || state !== oauthState) {
      return res.status(400).send("Ошибка OAuth: неверный state.");
    }

    const tokenResponse = await fetch(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          code: String(code),
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          redirect_uri: REDIRECT_URI,
          grant_type: "authorization_code",
        }),
      }
    );

    const tokens = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error("GOOGLE TOKEN ERROR:", tokens);
      return res.status(500).send(
        "Google не выдал токены. Проверьте OAuth-настройки."
      );
    }

    if (!tokens.refresh_token) {
      return res.status(500).send(
        "Google не вернул refresh token. Повторите авторизацию с подтверждением доступа."
      );
    }

    const refreshToken = tokens.refresh_token;

    res.send(`
      <html lang="ru">
      <head>
        <meta charset="UTF-8">
        <title>Google авторизация</title>
      </head>
      <body style="font-family:Arial;padding:30px">
        <h2>Google Calendar подключён ✅</h2>
        <p>Теперь скопируйте Refresh Token в Render:</p>

        <p><b>Render → dantist-ai → Environment</b></p>
        <p>Переменная:</p>

        <pre style="
          background:#f3f3f3;
          padding:15px;
          white-space:pre-wrap;
          word-break:break-all;
        ">${refreshToken}</pre>

        <p>
          Добавьте его в переменную
          <b>GOOGLE_REFRESH_TOKEN</b>.
        </p>

        <p>После сохранения Render автоматически перезапустится.</p>
      </body>
      </html>
    `);

  } catch (error) {
    console.error("GOOGLE OAUTH ERROR:", error);
    res.status(500).send("Ошибка авторизации Google.");
  }
});

/* -----------------------------
   REFRESH GOOGLE ACCESS TOKEN
----------------------------- */

async function getGoogleAccessToken() {
  if (
    cachedAccessToken &&
    Date.now() < accessTokenExpiresAt - 60000
  ) {
    return cachedAccessToken;
  }

  if (!GOOGLE_REFRESH_TOKEN) {
    throw new Error(
      "GOOGLE_REFRESH_TOKEN не настроен."
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
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: GOOGLE_REFRESH_TOKEN,
        grant_type: "refresh_token",
      }),
    }
  );

  const tokens = await response.json();

  if (!response.ok || !tokens.access_token) {
    console.error("GOOGLE REFRESH ERROR:", tokens);
    throw new Error(
      "Не удалось обновить Google access token."
    );
  }

  cachedAccessToken = tokens.access_token;

  accessTokenExpiresAt =
    Date.now() + (tokens.expires_in || 3600) * 1000;

  return cachedAccessToken;
}

/* -----------------------------
   CHAT
----------------------------- */

app.post("/api/chat", async (req, res) => {
  try {
    const message =
      String(req.body?.message || "").trim();

    if (!message) {
      return res.status(400).json({
        reply: "Напишите сообщение.",
      });
    }

    const googleAccessToken =
      await getGoogleAccessToken();

    const request = {
      model: "gpt-5.6-luna",

      prompt: {
        id: PROMPT_ID,
      },

      input: message,

      max_output_tokens: 1000,

      reasoning: {
        effort: "low",
      },

      text: {
        verbosity: "low",
      },

      prompt_cache_key: "dantist-ai-clinic",

      tools: [
        {
          type: "mcp",
          server_label: "google_calendar",
          connector_id: "connector_googlecalendar",
          authorization: googleAccessToken,

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

      max_tool_calls: 3,
    };

    if (req.body?.previous_response_id) {
      request.previous_response_id =
        String(req.body.previous_response_id);
    }

    const response =
      await openai.responses.create(request);

    res.json({
      reply:
        response.output_text || "Готово.",
      response_id: response.id,
    });

  } catch (error) {
    console.error(
      "OPENAI/MCP ERROR:",
      error
    );

    res.status(500).json({
      reply:
        "Произошла ошибка на сервере. Попробуйте ещё раз.",
    });
  }
});

app.listen(port, () => {
  console.log(
    `Дантист запущен на порту ${port}`
  );
});
