// Серверный пример для подключения к OpenAI Responses API.
// API-ключ храните ТОЛЬКО в переменной окружения OPENAI_API_KEY.
// Prompt ID вашего опубликованного промпта:
// pmpt_6aae2ebc9ae88190be922847c8059ca70e2c251001dfe637

// Этот файл — шаблон. Перед публикацией потребуется установить Node.js,
// пакет openai и добавить OPENAI_API_KEY на сервере.

import OpenAI from "openai";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(express.json());
app.use(express.static(__dirname));

app.post("/api/chat", async (req, res) => {
  try {
    const response = await client.responses.create({
      model: "gpt-5.6-luna",
      prompt: { id: "pmpt_6aae2ebc9ae88190be922847c8059ca70e2c251001dfe637" },
      input: req.body.message || ""
    });
    res.json({ reply: response.output_text });
  } catch (e) {
    console.error(e);
    res.status(500).json({ reply: "Ошибка сервера." });
  }
});

app.listen(process.env.PORT || 3000);
