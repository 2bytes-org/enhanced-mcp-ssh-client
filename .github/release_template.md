# Релиз v1.1.0

Первый официальный релиз Enhanced MCP SSH Client с множеством улучшений безопасности и удобства использования.

## Основные возможности:
- Безопасное подключение к SSH серверам через MCP
- Проверка безопасности команд с использованием LLM
- Автосохранение сессии каждые 10 секунд
- Защита от сбоев и потери прогресса с контрольными точками
- Защищенное логирование без хранения паролей

## Улучшения в этой версии:
- Увеличен таймаут SSH подключения до 120 секунд (2 минуты)
- Увеличен таймаут выполнения команд до 120 секунд (2 минуты)
- Увеличен таймаут запросов к LLM до 20 секунд
- Добавлена защита от потери прогресса с контрольными точками
- Добавлена история команд с возможностью просмотра
- Улучшен механизм логирования с разделением конфиденциальной информации

## Требования
- Для агентных возможностей: Ollama с моделью llama2

## Примечание по безопасности
Все проверки команд выполняются локально, защищая вашу приватность. Никакие данные не отправляются на внешние серверы.