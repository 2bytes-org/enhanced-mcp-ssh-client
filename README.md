# mcpsshclient

An MCP server SSHClient with a configurable :fireworks:agentic:fireworks: security agent that can detect and prevent "unsafe" commands from executing through your SSH connection.

[![Release](https://img.shields.io/github/v/release/2bytes-org/enhanced-mcp-ssh-client)](https://github.com/2bytes-org/enhanced-mcp-ssh-client/releases)
[![License](https://img.shields.io/github/license/2bytes-org/enhanced-mcp-ssh-client)](LICENSE)

## Enhanced Features

- Безопасное подключение к SSH серверам через MCP
- Проверка безопасности команд с использованием LLM
- **NEW!** Автосохранение сессии каждые 30 секунд (настраиваемо)
- **NEW!** Защита от сбоев и потери прогресса с контрольными точками
- **NEW!** Защищенное логирование без хранения паролей
- **NEW!** История команд с возможностью просмотра
- **NEW!** Улучшенная обработка ошибок и таймауты

## Prerequisite
To enable the agentic capabilities.
1. Download https://ollama.com/.
2. Run ```ollama serve```
3. Run ```ollama pull llama2```
4. Run ```ollama run llama2```

## Setup Instructions
1. Run ```git clone https://github.com/2bytes-org/enhanced-mcp-ssh-client.git```
2. Run ```npm install```
3. Run ```npm run build```

To enable the security agent, set ```"ENABLE_SECAGENT": true``` and ```"SECURITY_POLICY"``` in ```secagentconfig.json```

## Configuration
In your MCP Client make the corresponding change
```
{
  "mcpServers": {
    "sshclient": {
      "command": "node",
      "args": [
        "C:\\[full-path-to-mcpsshclient]\\build\\index.js"
      ]
    }
  }
}
```

## New MCP Tools

### Подключение к SSH серверу

```
new-ssh-connection
```

Параметры:
- `host`: IP-адрес или имя хоста сервера
- `port`: Порт SSH (по умолчанию 22)
- `username`: Имя пользователя
- `password`: Пароль

### Выполнение команд

```
run-safe-command
```

Параметры:
- `command`: Команда для выполнения на сервере

### Просмотр истории команд

```
show-command-history
```

### Восстановление прерванной сессии

```
resume-session
```

## Восстановление после сбоев

Состояние сессии автоматически сохраняется в файлах:
- `session_checkpoint.json`: Информация о подключении и выполненных командах
- `command_history.json`: История команд с результатами

Эти файлы автоматически сохраняются каждые 30 секунд и перед завершением программы.

## Настройки таймаутов

Для предотвращения проблем с потерей данных из-за таймаутов используются увеличенные таймауты:

- Таймаут SSH подключения: **120 секунд (2 минуты)**
- Таймаут выполнения команд: **120 секунд (2 минуты)**
- Таймаут запросов к LLM: **20 секунд**

Для дальнейшего увеличения таймаутов можно изменить следующие константы в исходном коде:

```typescript
// В файле index.ts
const CONNECTION_TIMEOUT = 120000; // Увеличьте при необходимости

// В файле secagent.ts
const REQUEST_TIMEOUT_MS = 20000; // Увеличьте при необходимости
```

## Логирование

Логи хранятся в файлах:
- `sshclient.log`: Основной лог (без конфиденциальной информации)
- `sensitive.log`: Конфиденциальная информация (защищен правами доступа)

## Безопасность и конфиденциальность

Клиент не отправляет никаких данных на внешние серверы, за исключением:

1. SSH-подключение к указанному вами серверу
2. Локальное соединение с Ollama на http://localhost:11434 (только если включено)

Все проверки команд могут выполняться полностью локально без использования внешних сервисов:

- Статические проверки безопасности команд встроены в код
- Использование локальной модели Llama через Ollama является опциональным
- Все данные журналов хранятся только локально

### Настройки конфиденциальности

В файле `secagentconfig.json` вы можете настроить следующие параметры:

```json
{
  "ENABLE_SECAGENT": true,           // Включить/выключить агента безопасности
  "USE_LOCAL_LLM": false,            // Использовать локальную модель Llama
  "USE_STATIC_CHECKS_ONLY": true,    // Использовать только статические проверки
  "SECURITY_POLICY": "..."           // Политика безопасности для команд
}
```

Мы рекомендуем использовать настройку `"USE_STATIC_CHECKS_ONLY": true` для максимальной приватности.

## Разрешение проблем

### Проблемы с потерей прогресса

Если вы столкнулись с потерей прогресса работы:

1. Проверьте файл `session_checkpoint.json` - в нем может быть сохранена информация о вашей сессии
2. Запустите клиент и используйте команду `resume-session`, чтобы увидеть информацию о предыдущей сессии
3. Используйте `show-command-history` для просмотра ранее выполненных команд

### Проблемы с Ollama

Если клиент не может подключиться к серверу Ollama для проверки безопасности:

1. Убедитесь, что сервер Ollama запущен на `http://localhost:11434`
2. Проверьте, что модель `llama2` установлена (`ollama pull llama2`)
3. Установите `"USE_STATIC_CHECKS_ONLY": true` в файле `secagentconfig.json` для использования только встроенных проверок

So far tested on the following:
- Claude Desktop: ```claude_desktop_config.json```
- Cursor AI: Command Panel -> Cursor Settings -> MCP Server
- VSCode Insider

## Версии и обновления

Текущая версия: **v1.1.0**

Информацию о новых выпусках и изменениях можно найти в [CHANGELOG.md](CHANGELOG.md) и на странице [Releases](https://github.com/2bytes-org/enhanced-mcp-ssh-client/releases).

Инструкции по созданию релизов можно найти в файле [README_RELEASE.md](README_RELEASE.md).

Have (responsible) fun! :rocket: