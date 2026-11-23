---
name: showcase-price-base
description: Цена на витрине matkasym-site — SHAAR только из прайсов Matkasym, HOME только из прайсов Make-in
---

Для SHAAR на сайт идут только прайсы базы Matkasym, для HOME — только прайсы Make-in (сказал пользователь 01.10.2026).

**Why:** загрузка прайса раньше писала на витрину цену Make-in всем товарам из Make-in — баки 120 л/1100 л (SHAAR, есть в обеих базах) показывали 3850 вместо 4110 из прайса Matkasym, и пользователь видел «загрузил — цены не поменялись».

**How to apply:** правило живёт в `writesShowcasePrice`/`showcasePriceBase` (`server/lib/stockBases.js`), использует его `POST /admin/upload-prices`. Товар без «своей» базы (бак 360 л — SHAAR, только в Make-in) берёт цену из той KG-базы, где он есть. Q-top (тенге) на витрину не пишет никогда. Перенос уже загруженных цен — `scripts/resync-showcase-prices.js` (трогает только товары, у которых сменилась база-источник; расхождения дилерских цен у HOME на 2–3 % — ручные правки, их не трогать). См. matkasym-site-project.

Диагностика «прайс загрузил, а результат 0»: каждый загруженный файл лежит в Cloudinary `matkasym/price-uploads/price_<base>_<type>_<ts>` (raw) — скачать и прогнать `parsePriceRows`; часто это повторная загрузка того же файла.
