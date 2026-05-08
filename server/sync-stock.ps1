# =============================================================
# sync-stock.ps1  —  Обновление остатков Маткасым из 1С
# Запускать на сервере wins1 через Windows Task Scheduler
# =============================================================

$1C_SERVER   = "wins1"
$1C_BASE     = "matkasym-25"
$1C_USER     = "Токтосунов Жанат"
$1C_PASS     = "1411"
$API_URL     = "https://matkasym-site.onrender.com/api/admin/sync-stock"
$API_KEY     = "matkasym-sync-2026"
$LOG_FILE    = "C:\matkasym\sync-stock.log"

# Создать папку для логов если нет
if (-not (Test-Path "C:\matkasym")) {
    New-Item -ItemType Directory -Path "C:\matkasym" | Out-Null
}

function Write-Log($msg) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $msg"
    Write-Host $line
    Add-Content -Path $LOG_FILE -Value $line -Encoding UTF8
}

Write-Log "=== Запуск синхронизации остатков ==="

try {
    # ── 1. Подключение к 1С ──────────────────────────────────
    Write-Log "Подключение к 1С (wins1\matkasym-25)..."
    $connector = New-Object -ComObject "V83.COMConnector"
    $ib = $connector.Connect("Srvr=""$1C_SERVER"";Ref=""$1C_BASE"";Usr=""$1C_USER"";Pwd=""$1C_PASS""")
    Write-Log "Подключение успешно"

    # ── 2. Запрос остатков из регистра бухгалтерии ───────────
    # Счета: 1610 (товары), 1620 (материалы), 1640 (готовая продукция)
    # Субконто1 = Номенклатура, Субконто2 = Склад
    Write-Log "Запрос остатков из регистра..."

    $query = $ib.NewObject("Запрос")
    $query.Текст = "
    ВЫБРАТЬ
        ХозрасчетныйОстатки.Субконто1.Наименование       КАК Наименование,
        ХозрасчетныйОстатки.Субконто2.Наименование       КАК Склад,
        ХозрасчетныйОстатки.КоличествоОстаток             КАК Остаток
    ИЗ
        РегистрБухгалтерии.Хозрасчетный.Остатки(
            &Дата,
            Счет.Код В (&Счета),
            ,
        ) КАК ХозрасчетныйОстатки
    ГДЕ
        ХозрасчетныйОстатки.Субконто1 <> ЗНАЧЕНИЕ(Справочник.Номенклатура.ПустаяСсылка)
    "

    $query.УстановитьПараметр("Дата",   (Get-Date))
    $query.УстановитьПараметр("Счета",  @("1610", "1620", "1640"))

    $result    = $query.Выполнить()
    $selection = $result.Выбрать()

    # ── 3. Сгруппировать: Основной + Коммерческий склад ─────
    $stockMap = @{}  # name → {osnovnoy, kommercheskiy}

    while ($selection.Следующий()) {
        $name      = [string]$selection.Наименование
        $warehouse = [string]$selection.Склад
        $qty       = [int][Math]::Floor([double]$selection.Остаток)

        if ($qty -le 0) { continue }
        if (-not $stockMap.ContainsKey($name)) {
            $stockMap[$name] = @{ osnovnoy = 0; kommercheskiy = 0 }
        }

        if ($warehouse -like "*Основной*") {
            $stockMap[$name].osnovnoy += $qty
        } elseif ($warehouse -like "*Коммерческий*") {
            $stockMap[$name].kommercheskiy += $qty
        }
    }

    Write-Log "Получено позиций из 1С: $($stockMap.Count)"

    # ── 4. Собрать массив для отправки ───────────────────────
    $stocks = @()
    foreach ($entry in $stockMap.GetEnumerator()) {
        $stocks += @{
            name          = $entry.Key
            osnovnoy      = $entry.Value.osnovnoy
            kommercheskiy = $entry.Value.kommercheskiy
        }
    }

    # ── 5. Отправить на Render.com ───────────────────────────
    Write-Log "Отправка на сервер ($($stocks.Count) позиций)..."

    $body = @{ stocks = $stocks } | ConvertTo-Json -Depth 4 -Compress
    $headers = @{ "x-api-key" = $API_KEY; "Content-Type" = "application/json" }

    $response = Invoke-RestMethod `
        -Uri     $API_URL `
        -Method  Post `
        -Body    ([System.Text.Encoding]::UTF8.GetBytes($body)) `
        -Headers $headers

    Write-Log "✅ Готово! Обновлено: $($response.matched)  Обнулено: $($response.zeroed)  Всего: $($response.total)"

} catch {
    Write-Log "❌ ОШИБКА: $_"
    exit 1
}

Write-Log "=== Синхронизация завершена ==="
