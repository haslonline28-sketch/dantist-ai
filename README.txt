ДАНТИСТ — ВЕБ-ЧАТ С OPENAI + GOOGLE CALENDAR MCP

Файлы:
- index.html — интерфейс чата.
- server.mjs — сервер, который вызывает OpenAI Responses API и официальный Google Calendar MCP.
- package.json — зависимости и команда запуска.

НАСТРОЙКИ НА ХОСТИНГЕ:
1. OPENAI_API_KEY — ваш секретный ключ OpenAI.
2. GOOGLE_CALENDAR_OAUTH_ACCESS_TOKEN — OAuth 2.0 access token для Google Calendar MCP.

Не помещайте эти значения в index.html и не добавляйте их в GitHub.

MCP:
- URL: https://calendarmcp.googleapis.com/mcp/v1
- Авторизация: OAuth 2.0.
- Для демо approval отключён через require_approval=never.
- Доступ ограничен календарными инструментами через allowed_tools.

Важно:
Access token Google OAuth временный. Для постоянного публичного сервиса лучше сделать полный OAuth flow с refresh token, а не хранить долгоживущий пользовательский токен.

Prompt ID уже встроен в server.mjs:
pmpt_6aae2ebc9ae88190be922847c8059ca70e2c251001dfe637
