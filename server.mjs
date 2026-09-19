import express from "express";
import OpenAI from "openai";

const app = express();
const port = process.env.PORT || 3000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const PROMPT_ID =
  "pmpt_6aae367cd5888195aafee0f4ab45190f05c44e3dc0d620aa";

const GOOGLE_CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID;

const GOOGLE_CLIENT_SECRET =
  process.env.GOOGLE_CLIENT_SECRET;

const GOOGLE_REFRESH_TOKEN =
  process.env.GOOGLE_REFRESH_TOKEN;

let cachedAccessToken = null;
let accessTokenExpiresAt = 0;

app.use(express.json());
app.use(express.static("."));

/*
  Получаем свежий Google access token.
  Пока старый токен действителен, используем его.
  Когда срок подходит к концу — автоматически получаем новый
  через refresh token.
*/
async function getGoogleAccessToken() {
  if (
    cachedAccessToken &&
    Date.now() < accessTokenExpiresAt - 60_000
  ) {
    return cachedAccessToken;
  }

  if (
    !GOOGLE_CLIENT_ID ||
    !GOOGLE_CLIENT_SECRET ||
    !GOOGLE_REFRESH_TOKEN
  ) {
    throw new Error(
      "Google OAuth переменные не настроены в Render."
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

  if (
    !response.ok ||
    !tokens.access_token
  ) {
    console.error(
      "GOOGLE TOKEN REFRESH ERROR:",
      tokens
    );

    throw new Error(
      "Google не смог обновить access token."
    );
  }

  cachedAccessToken = tokens.access_token;

  accessTokenExpiresAt =
    Date.now() +
    (tokens.expires_in || 3600) * 1000;

  return cachedAccessToken;
}

app.post("/api/chat", async (req, res) => {
  try {
    const message =
      String(req.body?.message || "").trim();

    if (!message) {
      return res.status(400).json({
        reply: "Напишите сообщение.",
      });
    }

    /*
      Каждый запрос получает действующий Google access token.
      Если старый истёк — он автоматически обновляется.
    */
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

      prompt_cache_key:
        "dantist-ai-clinic",

      tools: [
        {
          type: "mcp",

          server_label:
            "google_calendar",

          connector_id:
            "connector_googlecalendar",

          authorization:
            googleAccessToken,

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

    if (
      req.body?.previous_response_id
    ) {
      request.previous_response_id =
        String(
          req.body.previous_response_id
        );
    }

    const response =
      await openai.responses.create(
        request
      );

    res.json({
      reply:
        response.output_text ||
        "Готово.",
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
