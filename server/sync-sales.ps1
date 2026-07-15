# =============================================================
# sync-sales.ps1  —  Выгрузка продаж по агентам из 1С на сайт
# Запускать на сервере wins1 через Windows Task Scheduler
# (по образцу sync-stock.ps1)
# =============================================================

$1C_SERVER   = "wins1"
$1C_BASE     = "matkasym-25"
$1C_USER     = "Токтосунов Жанат"
$1C_PASS     = "1411"
$API_URL     = "https://matkasym-site.onrender.com/api/admin/sync-sales"
$API_KEY     = "matkasym-sync-2026"
$LOG_FILE    = "C:\matkasym\sync-sales.log"
$DAYS_BACK   = 90          # сколько последних дней пересылать каждый раз

if (-not (Test-Path "C:\matkasym")) {
    New-Item -ItemType Directory -Path "C:\matkasym" | Out-Null
}
function Write-Log($msg) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $msg"
    Write-Host $line
    Add-Content -Path $LOG_FILE -Value $line -Encoding UTF8
}

Write-Log "=== Запуск синхронизации продаж по агентам ==="

try {
    # ── 1. Подключение к 1С ──────────────────────────────────
    Write-Log "Подключение к 1С (wins1\matkasym-25)..."
    $connector = New-Object -ComObject "V83.COMConnector"
    $ib = $connector.Connect("Srvr=""$1C_SERVER"";Ref=""$1C_BASE"";Usr=""$1C_USER"";Pwd=""$1C_PASS""")
    Write-Log "Подключение успешно"

    # ── 2. Границы периода ───────────────────────────────────
    $dateTo   = (Get-Date).Date.AddDays(1).AddSeconds(-1)   # конец сегодняшнего дня
    $dateFrom = (Get-Date).Date.AddDays(-$DAYS_BACK)        # N дней назад, начало дня

    # ── 3. Запрос продаж из регистра «Продажи» ───────────────
    # ⚠️ ПРОВЕРЬ ИМЕНА под свою 1С (см. примечание внизу файла):
    #    РегистрНакопления.Продажи, реквизиты ТоргАгент / Контрагент / Номенклатура
    Write-Log "Запрос продаж из регистра «Продажи»..."

    $query = $ib.NewObject("Запрос")
    $query.Текст = "
    ВЫБРАТЬ
        Продажи.Период                          КАК Период,
        Продажи.Регистратор.Номер               КАК Номер,
        Продажи.ТоргАгент.Наименование          КАК Агент,
        Продажи.Контрагент.Наименование         КАК Контрагент,
        Продажи.Номенклатура.Наименование       КАК Номенклатура,
        Продажи.Количество                      КАК Количество,
        Продажи.Сумма                           КАК Сумма
    ИЗ
        РегистрНакопления.Продажи КАК Продажи
    ГДЕ
        Продажи.Период МЕЖДУ &Начало И &Конец
    УПОРЯДОЧИТЬ ПО
        Период
    "
    $query.УстановитьПараметр("Начало", $dateFrom)
    $query.УстановитьПараметр("Конец",  $dateTo)

    $result    = $query.Выполнить()
    $selection = $result.Выбрать()

    # ── 4. Собрать массив строк для отправки ─────────────────
    $sales = New-Object System.Collections.ArrayList
    while ($selection.Следующий()) {
        $qty = [double]$selection.Количество
        $sum = [double]$selection.Сумма
        $price = if ($qty -ne 0) { [Math]::Round($sum / $qty, 2) } else { 0 }
        [void]$sales.Add(@{
            docNumber    = [string]$selection.Номер
            docDate      = ([datetime]$selection.Период).ToString("yyyy-MM-ddTHH:mm:ss")
            agent        = [string]$selection.Агент
            counterparty = [string]$selection.Контрагент
            productName  = [string]$selection.Номенклатура
            quantity     = $qty
            price        = $price
            sum          = $sum
        })
    }
    Write-Log "Получено строк продаж: $($sales.Count)"

    # ── 5. Отправить на Render.com ───────────────────────────
    $payload = @{
        periodFrom = $dateFrom.ToString("yyyy-MM-dd")
        periodTo   = $dateTo.ToString("yyyy-MM-dd")
        sales      = $sales
    }
    $body = $payload | ConvertTo-Json -Depth 5 -Compress
    $headers = @{ "x-api-key" = $API_KEY; "Content-Type" = "application/json" }

    Write-Log "Отправка на сервер ($($sales.Count) строк, период $($payload.periodFrom)..$($payload.periodTo))..."
    $response = Invoke-RestMethod `
        -Uri     $API_URL `
        -Method  Post `
        -Body    ([System.Text.Encoding]::UTF8.GetBytes($body)) `
        -Headers $headers

    Write-Log "✅ Готово! Удалено: $($response.deleted)  Загружено: $($response.inserted)  Сопоставлено с товарами: $($response.matched)"

} catch {
    Write-Log "❌ ОШИБКА: $_"
    exit 1
}

Write-Log "=== Синхронизация продаж завершена ==="

# =============================================================
# ПРИМЕЧАНИЕ — что проверить, если запрос выдаёт ошибку:
#
# Точные имена в разных конфигурациях отличаются. Проверь в 1С:
#   • Имя регистра:      РегистрНакопления.Продажи  (может быть «ПродажиТМЗ»)
#   • Реквизит агента:   ТоргАгент  (в отчёте называется «Торг агент»)
#   • Реквизиты:         Контрагент, Номенклатура, Количество, Сумма
#
# Где посмотреть точные имена (без программиста):
#   Открой отчёт «Сводная продаж по агентам» → «Конструктор настроек…»
#   → на шаге «Поля» видны реальные имена: Контрагент, Номенклатура,
#     Торг агент, Продажи количество, Продажи сумма.
#   «Продажи количество» = регистр «Продажи», ресурс «Количество».
#
# Альтернатива (если регистр не подойдёт) — запрос по документам:
#   ИЗ Документ.РеализацияТМЗУслуг.Товары КАК Док
#   с полями Док.Ссылка.Дата, Док.Ссылка.Номер, Док.Ссылка.ТоргАгент, ...
# =============================================================
