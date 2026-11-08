# Резюме-игра

Пиксельный платформер о пути от строительной лаборатории к Python и ИИ.
Смотреть: https://crstknut.github.io/resume/

- Весь текст резюме — в `js/data.js` (уровень раскладывается из `beats` автоматически).
- Движок — `js/game.js` (canvas 320×180, автопилот), звук — `js/audio.js`, текстовое резюме — `js/cv.js`.
- Без сборки и зависимостей: открыть `index.html` через любой статический сервер.
- Картинка-превью: `google-chrome-stable --headless=new --window-size=1200,630 --screenshot=assets/cover.png "http://127.0.0.1:8765/?cover=1"`.
