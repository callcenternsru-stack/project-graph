<#
    SystemCheckPRO.ps1 – Исправленная версия
    - Окно благодарности остаётся открытым во время теста интернета и отправки
    - Финальное окно появляется после завершения
#>

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# Автоматический запрос прав администратора
if (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    $exePath = [System.Diagnostics.Process]::GetCurrentProcess().MainModule.FileName
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $exePath
    $psi.Verb = "runas"
    try {
        [System.Diagnostics.Process]::Start($psi) | Out-Null
        [System.Windows.Forms.Application]::Exit()
        exit
    } catch {
        [System.Windows.Forms.MessageBox]::Show("Не удалось получить права администратора. Программа будет закрыта.", "Ошибка", "OK", [System.Windows.Forms.MessageBoxIcon]::Error)
        exit
    }
}

$scriptDir = [System.IO.Path]::GetDirectoryName([System.Diagnostics.Process]::GetCurrentProcess().MainModule.FileName)

# --- Пути ---
$soxExe = Join-Path $scriptDir "sox.exe"
$speedtestExe = Join-Path $scriptDir "speedtest.exe"
$audioOutputPath = Join-Path $scriptDir "voice_recording.wav"
$audioMp3Path = Join-Path $scriptDir "voice_recording.mp3"
$logPath = Join-Path $scriptDir "debug_submit.log"

# --- Тексты для теста печати ---
$typingTexts = @(
    "Правое легкое человека вмещает больше воздуха, чем левое. Нервные импульсы в теле движутся со скоростью около 90 метров в секунду. Первый в истории одеколон появился как средство профилактики чумы. У пчелы два желудка - один для меда, другой для пищи. Существует более 100 различных вирусов, вызывающих насморк.",
    "Сердце белого кита имеет размер автомобиля Фольксваген Жук. В городе Крескилл в Нью-Джерси все коты и кошки должны носить 3 колокольчика, чтобы птицы всегда знали об их расположении. Если желтую канарейку кормить красным перцем, цвет ее перьев станет ярко-оранжевым. Более чем 70 % населения планеты никогда не слышали звонка телефона. В Африке только один из 40 человек имеет телефон. Язык хамелеона вдвое длиннее его тела.",
    "Бегемоты рождаются под водой. Большинство частиц пыли в доме - отмершие клетки кожи. Человеческий организм производит и убивает 15 миллионов красных кровяных телец в секунду. Одна пчелиная семья заготавливает за лето до 150 кг меда. Гром может быть слышен на расстоянии 25 км. Хоккейная шайба может развить скорость 160 километров в час."
)

# Флаг для включения мастер-ключа через файл testmode.flag
$testModeFile = Join-Path $scriptDir "testmode.flag"
$masterKeyEnabled = Test-Path $testModeFile

# Функция логирования с ротацией
function Add-Log {
    param([string]$Message)
    $maxLines = 1000
    $lines = @()
    if (Test-Path $logPath) {
        $lines = Get-Content $logPath
        if ($lines.Count -ge $maxLines) {
            $lines = $lines | Select-Object -Last ($maxLines - 1)
        }
    }
    $lines += "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message"
    $lines | Out-File $logPath -Encoding UTF8
}

# --- Функция проверки кода на сервере ---
function Test-Code {
    param([string]$Code)
    
    if ($masterKeyEnabled -and $Code -eq "ADMIN123") {
        return $true, $null, $null
    }
    
    $url = "https://grafic1.netlify.app/.netlify/functions/checkCode?code=$Code"
    try {
        $response = Invoke-RestMethod -Uri $url -Method Get -ErrorAction Stop
        if ($response.valid -eq $true) {
            return $true, $response.formData.project, $response.formData.projectId
        } else {
            return $false, $null, $null
        }
    } catch {
        return $false, $null, $null
    }
}

# ===================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====================
function Get-WindowsVersion {
    param([string]$OsString)
    if ($OsString -match 'Windows (\d+)') {
        return [int]$matches[1]
    }
    return $null
}

function Get-AudioDevices {
    $audioInfo = @()
    try {
        $devices = Get-WmiObject Win32_SoundDevice
        foreach ($dev in $devices) {
            $name = $dev.Name
            $status = $dev.Status
            $deviceType = "Неизвестно"
            
            if ($name -match "USB") { $deviceType = "USB" }
            elseif ($name -match "Bluetooth|BT") { $deviceType = "Bluetooth" }
            elseif ($name -match "HDMI") { $deviceType = "HDMI" }
            elseif ($name -match "Realtek.*(High Definition|HD Audio)" -or $name -match "Встроенное") { $deviceType = "Встроенное (аналоговое)" }
            else {
                if ($name -match "High Definition Audio|Audio Device|Динамики|Микрофон") { $deviceType = "Аналоговое (встроенное)" }
                else { $deviceType = "Аналоговое (предположительно)" }
            }
            
            $capabilities = "Неизвестно"
            if ($name -match "микрофон|mic|Microphone") { $capabilities = "Запись" }
            elseif ($name -match "динамики|наушники|Speaker|Headphone|Headset") { $capabilities = "Воспроизведение" }
            else { $capabilities = "Универсальное" }
            
            $audioInfo += @{
                Name = $name
                Status = $status
                Type = $deviceType
                Capabilities = $capabilities
            }
        }
    } catch {
        $audioInfo += @{
            Name = "Ошибка получения информации об аудиоустройствах"
            Status = "Error"
            Type = "Error"
            Capabilities = $_.ToString()
        }
    }
    return $audioInfo
}

# ОПРЕДЕЛЕНИЕ АКТИВНЫХ УСТРОЙСТВ ЧЕРЕЗ WINMM.DLL
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;

namespace Audio {
    public class Device {
        [DllImport("winmm.dll", SetLastError = true)]
        public static extern int waveOutGetNumDevs();

        [DllImport("winmm.dll", SetLastError = true)]
        public static extern int waveOutGetDevCaps(IntPtr uDeviceID, ref WAVEOUTCAPS pwoc, int cbwoc);

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
        public struct WAVEOUTCAPS {
            public short wMid;
            public short wPid;
            public int vDriverVersion;
            [MarshalAs(UnmanagedType.ByValArray, SizeConst = 32)]
            public byte[] szPname;
            public int dwFormats;
            public short wChannels;
            public short wReserved1;
            public int dwSupport;

            public string GetName() {
                string name = Encoding.Default.GetString(szPname).TrimEnd('\0');
                return name;
            }
        }

        [DllImport("winmm.dll", SetLastError = true)]
        public static extern int waveInGetNumDevs();

        [DllImport("winmm.dll", SetLastError = true)]
        public static extern int waveInGetDevCaps(IntPtr uDeviceID, ref WAVEINCAPS pwic, int cbwic);

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
        public struct WAVEINCAPS {
            public short wMid;
            public short wPid;
            public int vDriverVersion;
            [MarshalAs(UnmanagedType.ByValArray, SizeConst = 32)]
            public byte[] szPname;
            public int dwFormats;
            public short wChannels;
            public short wReserved1;

            public string GetName() {
                string name = Encoding.Default.GetString(szPname).TrimEnd('\0');
                return name;
            }
        }

        public static string GetDefaultOutputDevice() {
            int num = waveOutGetNumDevs();
            if (num > 0) {
                WAVEOUTCAPS caps = new WAVEOUTCAPS();
                int result = waveOutGetDevCaps((IntPtr)0, ref caps, Marshal.SizeOf(typeof(WAVEOUTCAPS)));
                if (result == 0) {
                    return caps.GetName();
                }
            }
            return null;
        }

        public static string GetDefaultInputDevice() {
            int num = waveInGetNumDevs();
            if (num > 0) {
                WAVEINCAPS caps = new WAVEINCAPS();
                int result = waveInGetDevCaps((IntPtr)0, ref caps, Marshal.SizeOf(typeof(WAVEINCAPS)));
                if (result == 0) {
                    return caps.GetName();
                }
            }
            return null;
        }
    }
}
"@

function Get-DefaultAudioDevices {
    $inputName = [Audio.Device]::GetDefaultInputDevice()
    $outputName = [Audio.Device]::GetDefaultOutputDevice()

    $inputInfo = $null
    if ($inputName) {
        $deviceType = "Неизвестно"
        if ($inputName -match "USB") { $deviceType = "USB" }
        elseif ($inputName -match "Bluetooth|BT") { $deviceType = "Bluetooth" }
        elseif ($inputName -match "HDMI") { $deviceType = "HDMI" }
        elseif ($inputName -match "Realtek.*(High Definition|HD Audio)" -or $inputName -match "Встроенное") { $deviceType = "Встроенное (аналоговое)" }
        else {
            if ($inputName -match "High Definition Audio|Audio Device|Динамики|Микрофон") { $deviceType = "Аналоговое (встроенное)" }
            else { $deviceType = "Аналоговое (предположительно)" }
        }
        $inputInfo = @{
            Name = $inputName
            Type = $deviceType
            Status = "OK (по умолчанию)"
        }
    }

    $outputInfo = $null
    if ($outputName) {
        $deviceType = "Неизвестно"
        if ($outputName -match "USB") { $deviceType = "USB" }
        elseif ($outputName -match "Bluetooth|BT") { $deviceType = "Bluetooth" }
        elseif ($outputName -match "HDMI") { $deviceType = "HDMI" }
        elseif ($outputName -match "Realtek.*(High Definition|HD Audio)" -or $outputName -match "Встроенное") { $deviceType = "Встроенное (аналоговое)" }
        else {
            if ($outputName -match "High Definition Audio|Audio Device|Динамики|Микрофон") { $deviceType = "Аналоговое (встроенное)" }
            else { $deviceType = "Аналоговое (предположительно)" }
        }
        $outputInfo = @{
            Name = $outputName
            Type = $deviceType
            Status = "OK (по умолчанию)"
        }
    }

    return @{
        Input  = $inputInfo
        Output = $outputInfo
    }
}

function Get-NetworkType {
    $connectionType = "Неизвестно"
    try {
        $profiles = Get-NetConnectionProfile -ErrorAction Stop
        $activeProfile = $profiles | Where-Object { $_.IPv4Connectivity -eq "Internet" -or $_.IPv6Connectivity -eq "Internet" } | Select-Object -First 1
        if ($activeProfile) {
            $interfaceAlias = $activeProfile.InterfaceAlias
            $adapter = Get-NetAdapter -Name $interfaceAlias -ErrorAction SilentlyContinue
            if ($adapter) {
                if ($adapter.Name -match "Ethernet|LAN|PCIe") {
                    return "LAN (кабель)"
                } elseif ($adapter.Name -match "Wi-Fi|Wireless|WLAN") {
                    return "Wi-Fi"
                }
            }
        }
    } catch {
        try {
            $adapters = Get-WmiObject Win32_NetworkAdapter | Where-Object { $_.NetConnectionId -and $_.NetEnabled -eq $true }
            foreach ($adapter in $adapters) {
                $name = $adapter.Name
                if ($name -match "Ethernet|LAN|PCIe") {
                    $connectionType = "LAN (кабель)"; break
                } elseif ($name -match "Wi-Fi|Wireless|WLAN") {
                    $connectionType = "Wi-Fi"; break
                }
            }
        } catch {
            $connectionType = "Ошибка определения"
        }
    }
    return $connectionType
}

function Get-DeviceType {
    $deviceType = "Неизвестно"
    try {
        $cs = Get-WmiObject -Class Win32_ComputerSystem
        switch ($cs.PCSystemType) {
            1 { $deviceType = "Настольный ПК" }
            2 { $deviceType = "Ноутбук" }
            3 { $deviceType = "Рабочая станция" }
            4 { $deviceType = "Сервер" }
            5 { $deviceType = "Домашний сервер" }
            6 { $deviceType = "Планшет" }
            default {
                $enclosure = Get-WmiObject -Class Win32_SystemEnclosure
                $chassisTypes = $enclosure.ChassisTypes
                $isLaptopChassis = $false
                foreach ($type in $chassisTypes) {
                    if ($type -in @(8,9,10,14)) { $isLaptopChassis = $true; break }
                }
                $hasBattery = Get-WmiObject -Class Win32_Battery -ErrorAction SilentlyContinue
                if ($isLaptopChassis -or $hasBattery) { $deviceType = "Ноутбук" }
                else { $deviceType = "Настольный ПК (предположительно)" }
            }
        }
    } catch {
        $deviceType = "Ошибка определения"
    }
    return $deviceType
}

function Get-ProjectRequirements {
    param([string]$ProjectId)
    if ([string]::IsNullOrEmpty($ProjectId)) { return $null }
    $url = "https://grafic1.netlify.app/.netlify/functions/getCharacteristics?projectId=$([System.Uri]::EscapeDataString($ProjectId))"
    try {
        $response = Invoke-RestMethod -Uri $url -Method Get -ErrorAction Stop
        if ($response -is [array] -and $response.Count -gt 0) {
            return $response[0]
        } else {
            return $null
        }
    } catch {
        Add-Log "Ошибка загрузки характеристик: $_"
        return $null
    }
}

function Compare-WithRequirements {
    param(
        $Hardware,
        $NetworkType,
        $InternetResult,
        $Requirements,
        $DefaultAudioInput
    )
    
    if (-not $Requirements) {
        return @{
            VerdictString = "Характеристики проекта не заданы. Решение будет принято HR-менеджером."
            Issues = @()
        }
    }
    
    $issues = @()
    $details = @()
    
    # --- ОС ---
    $os = $Hardware.OS
    $requiredOs = $Requirements.os
    $reqVer = Get-WindowsVersion -OsString $requiredOs
    $actualVer = Get-WindowsVersion -OsString $os
    if ($reqVer -ne $null -and $actualVer -ne $null) {
        if ($actualVer -lt $reqVer) {
            $issues += "OS"
            $details += "ОС: требуется Windows $reqVer или новее, получено Windows $actualVer"
        }
    } else {
        if ($os -notmatch [regex]::Escape($requiredOs)) {
            $issues += "OS"
            $details += "ОС: требуется '$requiredOs', получено '$os'"
        }
    }
    
    # --- Тип подключения ---
    $conn = $NetworkType
    $requiredConn = $Requirements.connectionType
    if ($requiredConn -eq "LAN") {
        if ($conn -notmatch "LAN") {
            $issues += "ConnectionType"
            $details += "Тип подключения: требуется LAN, получено $conn"
        }
    } elseif ($requiredConn -eq "Wi-Fi") {
        if ($conn -notmatch "Wi-Fi" -and $conn -notmatch "LAN") {
            $issues += "ConnectionType"
            $details += "Тип подключения: требуется Wi-Fi или LAN, получено $conn"
        }
    }
    
    # --- Скорость интернета ---
    if ($InternetResult) {
        $download = $InternetResult.download
        $requiredSpeed = [int]($Requirements.internetSpeed -replace ' .*', '')
        if ($download -lt $requiredSpeed) {
            $issues += "InternetSpeed"
            $details += "Скорость интернета: требуется не менее $requiredSpeed Мбит/с, получено $([math]::Round($download,2)) Мбит/с"
        }
    } else {
        $issues += "InternetSpeed"
        $details += "Нет данных о скорости интернета"
    }
    
    # --- ОЗУ ---
    $ram = $Hardware.RAM
    $ramValue = [int]($ram -replace ' .*', '')
    $requiredRam = [int]($Requirements.ram -replace ' .*', '')
    if ($ramValue -lt $requiredRam) {
        $issues += "RAM"
        $details += "ОЗУ: требуется не менее $requiredRam ГБ, получено $ramValue ГБ"
    }
    
    # --- Ядра ---
    $cpu = $Hardware.CPU
    if ($cpu -match 'Ядер: (\d+)') {
        $cores = [int]$matches[1]
        $requiredCores = [int]$Requirements.cores
        if ($cores -lt $requiredCores) {
            $issues += "Cores"
            $details += "Количество ядер: требуется не менее $requiredCores, получено $cores"
        }
    }
    
    # --- Тип подключения гарнитуры ---
    $audioIssue = $false
    if ($DefaultAudioInput -and $DefaultAudioInput.Type -notmatch "USB") {
        $audioIssue = $true
        $details += "Тип подключения гарнитуры: требуется USB, получено $($DefaultAudioInput.Type)"
    } elseif (-not $DefaultAudioInput) {
        $audioIssue = $true
        $details += "Тип подключения гарнитуры: требуется USB, устройство ввода не определено"
    }
    if ($audioIssue) {
        $issues += "AudioType"
    }
    
    $verdictString = if ($issues.Count -eq 0) {
        "✅ ПОДХОДИТ: все требования выполнены."
    } else {
        "❌ НЕ ПОДХОДИТ. Несоответствия:`n" + ($details -join "`n")
    }
    
    return @{
        VerdictString = $verdictString
        Issues = $issues
    }
}

# ===================== ОКНО ПРОГРЕССА =====================
$global:progressForm = $null
$global:progressLabel = $null

function Show-Progress {
    param([string]$Message)
    if ($global:progressForm -eq $null) {
        $form = New-Object System.Windows.Forms.Form
        $form.Text = "SystemCheck PRO"
        $form.Size = New-Object System.Drawing.Size(400, 150)
        $form.StartPosition = "CenterScreen"
        $form.FormBorderStyle = "FixedDialog"
        $form.ControlBox = $false
        $form.BackColor = [System.Drawing.Color]::FromArgb(0, 0, 0)
        $form.TopMost = $true
        $label = New-Object System.Windows.Forms.Label
        $label.Location = New-Object System.Drawing.Point(20, 40)
        $label.Size = New-Object System.Drawing.Size(360, 60)
        $label.TextAlign = [System.Drawing.ContentAlignment]::MiddleCenter
        $label.ForeColor = [System.Drawing.Color]::FromArgb(255, 215, 0)
        $label.Font = New-Object System.Drawing.Font("Segoe UI", 12, [System.Drawing.FontStyle]::Bold)
        $form.Controls.Add($label)
        $global:progressForm = $form
        $global:progressLabel = $label
        $form.Show()
        $form.Refresh()
        [System.Windows.Forms.Application]::DoEvents()
    }
    $global:progressLabel.Text = $Message
    $global:progressForm.Refresh()
    [System.Windows.Forms.Application]::DoEvents()
}

function Hide-Progress {
    if ($global:progressForm -ne $null) {
        $global:progressForm.Close()
        $global:progressForm.Dispose()
        $global:progressForm = $null
    }
}

# ===================== ПРИВЕТСТВЕННОЕ ОКНО =====================
function Show-WelcomeWindow {
    $form = New-Object System.Windows.Forms.Form
    $form.Text = "SystemCheck PRO"
    $form.Size = New-Object System.Drawing.Size(800, 500)
    $form.StartPosition = "CenterScreen"
    $form.FormBorderStyle = "FixedDialog"
    $form.MaximizeBox = $false
    $form.MinimizeBox = $false
    $form.BackColor = [System.Drawing.Color]::FromArgb(0, 0, 0)
    $form.ControlBox = $false
    $form.Icon = [System.Drawing.Icon]::ExtractAssociatedIcon([System.Windows.Forms.Application]::ExecutablePath)

    $labelCompany = New-Object System.Windows.Forms.Label
    $labelCompany.Text = "КОНТАКТ-СЕРВИС"
    $labelCompany.Location = New-Object System.Drawing.Point(0, 40)
    $labelCompany.Size = New-Object System.Drawing.Size(800, 50)
    $labelCompany.TextAlign = [System.Drawing.ContentAlignment]::MiddleCenter
    $labelCompany.ForeColor = [System.Drawing.Color]::FromArgb(255, 215, 0)
    $labelCompany.Font = New-Object System.Drawing.Font("Segoe UI", 24, [System.Drawing.FontStyle]::Bold)
    $form.Controls.Add($labelCompany)

    $labelProgram = New-Object System.Windows.Forms.Label
    $labelProgram.Text = "SystemCheck PRO"
    $labelProgram.Location = New-Object System.Drawing.Point(0, 100)
    $labelProgram.Size = New-Object System.Drawing.Size(800, 40)
    $labelProgram.TextAlign = [System.Drawing.ContentAlignment]::MiddleCenter
    $labelProgram.ForeColor = [System.Drawing.Color]::FromArgb(255, 215, 0)
    $labelProgram.Font = New-Object System.Drawing.Font("Segoe UI", 20, [System.Drawing.FontStyle]::Bold)
    $form.Controls.Add($labelProgram)

    $instruction = @"
В ходе проверки будет выполнено:
• Тест скорости печати
• Запись голосового образца
• Проверка интернета

Пожалуйста, введите уникальный код и нажмите "Начать проверку".
"@
    $labelInstruction = New-Object System.Windows.Forms.Label
    $labelInstruction.Text = $instruction
    $labelInstruction.Location = New-Object System.Drawing.Point(100, 150)
    $labelInstruction.Size = New-Object System.Drawing.Size(600, 120)
    $labelInstruction.TextAlign = [System.Drawing.ContentAlignment]::TopLeft
    $labelInstruction.ForeColor = [System.Drawing.Color]::White
    $labelInstruction.Font = New-Object System.Drawing.Font("Segoe UI", 11)
    $form.Controls.Add($labelInstruction)

    $textBox = New-Object System.Windows.Forms.TextBox
    $textBox.Location = New-Object System.Drawing.Point(200, 290)
    $textBox.Size = New-Object System.Drawing.Size(400, 30)
    $textBox.BackColor = [System.Drawing.Color]::FromArgb(30, 30, 30)
    $textBox.ForeColor = [System.Drawing.Color]::White
    $textBox.BorderStyle = [System.Windows.Forms.BorderStyle]::FixedSingle
    $textBox.Font = New-Object System.Drawing.Font("Segoe UI", 12)
    $textBox.TextAlign = [System.Windows.Forms.HorizontalAlignment]::Center
    $form.Controls.Add($textBox)

    $buttonStart = New-Object System.Windows.Forms.Button
    $buttonStart.Text = "Начать проверку"
    $buttonStart.Location = New-Object System.Drawing.Point(290, 350)
    $buttonStart.Size = New-Object System.Drawing.Size(220, 50)
    $buttonStart.BackColor = [System.Drawing.Color]::FromArgb(255, 215, 0)
    $buttonStart.ForeColor = [System.Drawing.Color]::Black
    $buttonStart.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
    $buttonStart.FlatAppearance.BorderSize = 0
    $buttonStart.Font = New-Object System.Drawing.Font("Segoe UI", 14, [System.Drawing.FontStyle]::Bold)
    $buttonStart.Cursor = [System.Windows.Forms.Cursors]::Hand
    $buttonStart.Enabled = $false
    $form.Controls.Add($buttonStart)

    $buttonClose = New-Object System.Windows.Forms.Button
    $buttonClose.Text = "Закрыть"
    $buttonClose.Location = New-Object System.Drawing.Point(20, 430)
    $buttonClose.Size = New-Object System.Drawing.Size(100, 30)
    $buttonClose.BackColor = [System.Drawing.Color]::FromArgb(255, 215, 0)
    $buttonClose.ForeColor = [System.Drawing.Color]::Black
    $buttonClose.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
    $buttonClose.Font = New-Object System.Drawing.Font("Segoe UI", 10)
    $buttonClose.Cursor = [System.Windows.Forms.Cursors]::Hand
    $form.Controls.Add($buttonClose)

    $errorLabel = New-Object System.Windows.Forms.Label
    $errorLabel.Text = ""
    $errorLabel.Location = New-Object System.Drawing.Point(100, 430)
    $errorLabel.Size = New-Object System.Drawing.Size(600, 20)
    $errorLabel.TextAlign = [System.Drawing.ContentAlignment]::MiddleCenter
    $errorLabel.ForeColor = [System.Drawing.Color]::Red
    $errorLabel.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
    $errorLabel.Visible = $false
    $form.Controls.Add($errorLabel)

    $textBox.Add_TextChanged({
        $buttonStart.Enabled = ($textBox.Text.Trim() -ne "")
        $errorLabel.Visible = $false
    })

    $buttonClose.Add_Click({
        $form.Close()
        [System.Windows.Forms.Application]::Exit()
    })

    $buttonStart.Add_Click({
        $code = $textBox.Text.Trim()
        $valid, $project, $projectId = Test-Code -Code $code
        if ($valid) {
            $form.Tag = $code
            $global:candidateProject = $project
            $global:candidateProjectId = $projectId
            $form.Close()
        } else {
            $errorLabel.Text = "Введённый код недействителен или уже использован. Попробуйте снова."
            $errorLabel.Visible = $true
        }
    })

    $form.Add_FormClosed({
        if ($form.Tag -eq $null) {
            [System.Windows.Forms.Application]::Exit()
        }
    })

    $form.ShowDialog() | Out-Null
    return $form.Tag
}

# === Ввод уникального кода ===
$candidateCode = Show-WelcomeWindow
if ([string]::IsNullOrEmpty($candidateCode)) {
    [System.Windows.Forms.Application]::Exit()
    exit
}

# === Загрузка требований проекта по projectId ===
$global:requirements = Get-ProjectRequirements -ProjectId $global:candidateProjectId
if ($global:requirements) {
    Add-Log "Загружены требования для проекта $global:candidateProjectId"
} else {
    Add-Log "Требования для проекта $global:candidateProjectId не найдены"
}

# === СБОР ХАРАКТЕРИСТИК ПК ===
Show-Progress "Идет загрузка..."
Start-Sleep -Milliseconds 100

function Get-BaseHardwareInfo {
    $info = @{}
    try { 
        $cpu = Get-CimInstance Win32_Processor -ErrorAction Stop
        $info["CPU"] = "$($cpu.Name.Trim()) | Ядер: $($cpu.NumberOfCores) | Логических: $($cpu.NumberOfLogicalProcessors)"
    } catch { $info["CPU"] = "Не удалось определить" }

    try { 
        $ram = Get-CimInstance Win32_ComputerSystem -ErrorAction Stop
        $totalRamGB = [math]::Round($ram.TotalPhysicalMemory / 1GB, 2)
        $info["RAM"] = "$totalRamGB GB"
    } catch { $info["RAM"] = "Не удалось определить" }

    try { 
        $diskC = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'" -ErrorAction Stop
        $diskSizeGB = [math]::Round($diskC.Size / 1GB, 2)
        $diskFreeGB = [math]::Round($diskC.FreeSpace / 1GB, 2)
        try { 
            $drive = Get-CimInstance Win32_DiskDrive | Where-Object { $_.Index -eq 0 } -ErrorAction Stop
            if ($drive.Model -match "SSD|NVMe|Solid State") { $diskType = "SSD" } else { $diskType = "HDD" }
        } catch { $diskType = "Неизвестно" }
        $info["SystemDisk"] = "$diskType | $diskSizeGB GB (свободно $diskFreeGB GB)"
    } catch { $info["SystemDisk"] = "Не удалось определить" }

    try { 
        $os = Get-CimInstance Win32_OperatingSystem -ErrorAction Stop
        $info["OS"] = $os.Caption
    } catch { $info["OS"] = "Не удалось определить" }

    return $info
}

$hardware = Get-BaseHardwareInfo
$audioDevices = Get-AudioDevices
$defaultAudio = Get-DefaultAudioDevices
$networkType = Get-NetworkType
$deviceType = Get-DeviceType

# ===================== ТЕСТ СКОРОСТИ ПЕЧАТИ =====================
Hide-Progress
function Show-TypingTest {
    $form = New-Object System.Windows.Forms.Form
    $form.Text = "Тест скорости печати"
    $form.Size = New-Object System.Drawing.Size(900, 700)
    $form.StartPosition = "CenterScreen"
    $form.FormBorderStyle = "FixedDialog"
    $form.MaximizeBox = $false
    $form.MinimizeBox = $false
    $form.BackColor = [System.Drawing.Color]::FromArgb(0, 0, 0)
    $form.ControlBox = $false
    $form.Icon = [System.Drawing.Icon]::ExtractAssociatedIcon([System.Windows.Forms.Application]::ExecutablePath)

    $title = New-Object System.Windows.Forms.Label
    $title.Text = "ТЕСТ СКОРОСТИ ПЕЧАТИ"
    $title.Location = New-Object System.Drawing.Point(0, 20)
    $title.Size = New-Object System.Drawing.Size(900, 30)
    $title.TextAlign = [System.Drawing.ContentAlignment]::MiddleCenter
    $title.ForeColor = [System.Drawing.Color]::FromArgb(255, 215, 0)
    $title.Font = New-Object System.Drawing.Font("Segoe UI", 16, [System.Drawing.FontStyle]::Bold)
    $form.Controls.Add($title)

    $labelHint = New-Object System.Windows.Forms.Label
    $labelHint.Text = "Начните печатать – совпадающие символы подсветятся жёлтым."
    $labelHint.Location = New-Object System.Drawing.Point(30, 60)
    $labelHint.Size = New-Object System.Drawing.Size(840, 20)
    $labelHint.TextAlign = [System.Drawing.ContentAlignment]::MiddleCenter
    $labelHint.ForeColor = [System.Drawing.Color]::LightGray
    $labelHint.Font = New-Object System.Drawing.Font("Segoe UI", 9)
    $form.Controls.Add($labelHint)

    $currentTextIndex = 0
    $sampleText = $typingTexts[$currentTextIndex]

    $richTextBox = New-Object System.Windows.Forms.RichTextBox
    $richTextBox.Location = New-Object System.Drawing.Point(30, 90)
    $richTextBox.Size = New-Object System.Drawing.Size(840, 280)
    $richTextBox.BackColor = [System.Drawing.Color]::Black
    $richTextBox.ForeColor = [System.Drawing.Color]::White
    $richTextBox.Font = New-Object System.Drawing.Font("Consolas", 14)
    $richTextBox.Text = $sampleText
    $richTextBox.ReadOnly = $false
    $richTextBox.BorderStyle = [System.Windows.Forms.BorderStyle]::None
    $richTextBox.WordWrap = $true
    $richTextBox.ScrollBars = "Vertical"
    $richTextBox.Cursor = [System.Windows.Forms.Cursors]::IBeam
    $form.Controls.Add($richTextBox)

    $buttonStart = New-Object System.Windows.Forms.Button
    $buttonStart.Text = "СТАРТ"
    $buttonStart.Location = New-Object System.Drawing.Point(250, 400)
    $buttonStart.Size = New-Object System.Drawing.Size(100, 35)
    $buttonStart.BackColor = [System.Drawing.Color]::FromArgb(255, 215, 0)
    $buttonStart.ForeColor = [System.Drawing.Color]::Black
    $buttonStart.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
    $buttonStart.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
    $buttonStart.Cursor = [System.Windows.Forms.Cursors]::Hand
    $form.Controls.Add($buttonStart)

    $buttonRestart = New-Object System.Windows.Forms.Button
    $buttonRestart.Text = "ЗАНОВО"
    $buttonRestart.Location = New-Object System.Drawing.Point(370, 400)
    $buttonRestart.Size = New-Object System.Drawing.Size(120, 35)
    $buttonRestart.BackColor = [System.Drawing.Color]::FromArgb(255, 215, 0)
    $buttonRestart.ForeColor = [System.Drawing.Color]::Black
    $buttonRestart.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
    $buttonRestart.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
    $buttonRestart.Cursor = [System.Windows.Forms.Cursors]::Hand
    $form.Controls.Add($buttonRestart)

    $labelResult = New-Object System.Windows.Forms.Label
    $labelResult.Location = New-Object System.Drawing.Point(30, 460)
    $labelResult.Size = New-Object System.Drawing.Size(840, 40)
    $labelResult.TextAlign = [System.Drawing.ContentAlignment]::MiddleCenter
    $labelResult.ForeColor = [System.Drawing.Color]::White
    $labelResult.Font = New-Object System.Drawing.Font("Segoe UI", 12, [System.Drawing.FontStyle]::Bold)
    $form.Controls.Add($labelResult)

    $buttonNext = New-Object System.Windows.Forms.Button
    $buttonNext.Text = "ПЕРЕЙТИ К СЛЕДУЮЩЕМУ ЗАДАНИЮ →"
    $buttonNext.Location = New-Object System.Drawing.Point(300, 520)
    $buttonNext.Size = New-Object System.Drawing.Size(300, 45)
    $buttonNext.BackColor = [System.Drawing.Color]::FromArgb(76, 175, 80)
    $buttonNext.ForeColor = [System.Drawing.Color]::White
    $buttonNext.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
    $buttonNext.Font = New-Object System.Drawing.Font("Segoe UI", 12, [System.Drawing.FontStyle]::Bold)
    $buttonNext.Cursor = [System.Windows.Forms.Cursors]::Hand
    $buttonNext.Visible = $false
    $form.Controls.Add($buttonNext)

    $form.Tag = @{
        StartTime = $null
        OriginalText = $sampleText
        TestActive = $false
        Completed = $false
        CurrentPos = 0
        MistakePositions = @()
        TextIndex = $currentTextIndex
    }

    $form.Add_FormClosed({
        $state = $form.Tag
        if (-not $state.Completed) {
            [System.Windows.Forms.Application]::Exit()
        }
    })

    function Update-TypingText {
        param($newIndex)
        $state = $form.Tag
        $state.TextIndex = $newIndex
        $state.OriginalText = $typingTexts[$newIndex]
        $richTextBox.Text = $typingTexts[$newIndex]
        $richTextBox.SelectAll()
        $richTextBox.SelectionColor = [System.Drawing.Color]::White
        $richTextBox.Select(0, 0)
        $state.CurrentPos = 0
        $state.MistakePositions = @()
        $state.StartTime = $null
        $state.TestActive = $false
        $state.Completed = $false
        $buttonStart.Enabled = $true
        $richTextBox.ReadOnly = $false
        $labelResult.Text = ""
        $buttonNext.Visible = $false
    }

    $richTextBox.Add_KeyPress({
        param($sender, $e)
        $state = $form.Tag
        if (-not $state.TestActive) {
            $e.Handled = $true
            return
        }
        $char = $e.KeyChar
        if ($char -eq [char]8) {
            $e.Handled = $true
            return
        }
        if ([char]::IsControl($char)) {
            $e.Handled = $true
            return
        }
        if ($state.CurrentPos -ge $state.OriginalText.Length) {
            $e.Handled = $true
            return
        }
        $originalChar = $state.OriginalText[$state.CurrentPos]
        if ($char -eq $originalChar) {
            $richTextBox.Select($state.CurrentPos, 1)
            $richTextBox.SelectionColor = [System.Drawing.Color]::FromArgb(255, 215, 0)
            $state.CurrentPos++
        } else {
            $state.MistakePositions += $state.CurrentPos
        }
        $richTextBox.Select($state.CurrentPos, 0)
        $e.Handled = $true

        if ($state.CurrentPos -ge $state.OriginalText.Length) {
            Complete-Test
        }
    })

    $richTextBox.Add_KeyDown({
        param($sender, $e)
        $state = $form.Tag
        if (-not $state.TestActive) {
            $e.SuppressKeyPress = $true
            return
        }
        if ($e.KeyCode -eq [System.Windows.Forms.Keys]::Enter) {
            $e.SuppressKeyPress = $true
            return
        }
        if ($e.KeyCode -eq [System.Windows.Forms.Keys]::Left -or
            $e.KeyCode -eq [System.Windows.Forms.Keys]::Right -or
            $e.KeyCode -eq [System.Windows.Forms.Keys]::Up -or
            $e.KeyCode -eq [System.Windows.Forms.Keys]::Down -or
            $e.KeyCode -eq [System.Windows.Forms.Keys]::Home -or
            $e.KeyCode -eq [System.Windows.Forms.Keys]::End -or
            $e.KeyCode -eq [System.Windows.Forms.Keys]::PageUp -or
            $e.KeyCode -eq [System.Windows.Forms.Keys]::PageDown) {
            $e.SuppressKeyPress = $true
            return
        }
        if ($e.KeyCode -eq [System.Windows.Forms.Keys]::Back) {
            $e.SuppressKeyPress = $true
            return
        }
        if ($e.Control -and ($e.KeyCode -eq [System.Windows.Forms.Keys]::V -or $e.KeyCode -eq [System.Windows.Forms.Keys]::X)) {
            $e.SuppressKeyPress = $true
            return
        }
        if ($state.CurrentPos -ne $richTextBox.SelectionStart) {
            $richTextBox.Select($state.CurrentPos, 0)
        }
    })

    function Complete-Test {
        $state = $form.Tag
        if ($state.Completed) { return }
        $state.Completed = $true
        $state.TestActive = $false

        $endTime = Get-Date
        $duration = ($endTime - $state.StartTime).TotalSeconds

        $errors = $state.MistakePositions.Count
        $charsTyped = $state.CurrentPos
        $cpm = if ($duration -gt 0) { [math]::Round(($charsTyped / $duration) * 60) } else { 0 }
        $totalAttempts = $charsTyped + $errors
        $accuracy = if ($totalAttempts -gt 0) { [math]::Round(($charsTyped / $totalAttempts) * 100, 1) } else { 100 }

        $global:typingResult = @{
            Duration = $duration
            Characters = $charsTyped
            Errors = $errors
            CPM = $cpm
            Accuracy = $accuracy
            TextIndex = $state.TextIndex
        }

        $labelResult.Text = "Скорость: $cpm зн/мин   |   Ошибки: $errors   |   Точность: $accuracy%"
        $buttonStart.Enabled = $false
        $richTextBox.ReadOnly = $true
        $buttonNext.Visible = $true
    }

    $buttonStart.Add_Click({
        $state = $form.Tag
        if ($state.Completed) { return }
        $richTextBox.SelectAll()
        $richTextBox.SelectionColor = [System.Drawing.Color]::White
        $richTextBox.Select(0, 0)
        $state.CurrentPos = 0
        $state.MistakePositions = @()
        $state.StartTime = Get-Date
        $state.TestActive = $true
        $state.Completed = $false
        $buttonStart.Enabled = $false
        $richTextBox.ReadOnly = $false
        $richTextBox.Focus()
        $labelResult.Text = "Начните печатать..."
    })

    $buttonRestart.Add_Click({
        $state = $form.Tag
        $newIndex = ($state.TextIndex + 1) % $typingTexts.Length
        Update-TypingText -newIndex $newIndex
    })

    $buttonNext.Add_Click({
        $form.Close()
    })

    $form.ShowDialog() | Out-Null
}

Show-TypingTest

# ===================== ЗАПИСЬ ГОЛОСА =====================
if (-not (Test-Path $soxExe)) {
    $result = [System.Windows.Forms.MessageBox]::Show(
        "Не найден файл sox.exe. Программа записи голоса не будет работать.`nХотите скачать sox?",
        "Ошибка",
        [System.Windows.Forms.MessageBoxButtons]::YesNo,
        [System.Windows.Forms.MessageBoxIcon]::Error
    )
    if ($result -eq [System.Windows.Forms.DialogResult]::Yes) {
        Start-Process "https://sourceforge.net/projects/sox/files/sox/14.4.2/sox-14.4.2-win32.zip/download"
    }
    [System.Windows.Forms.Application]::Exit()
    exit
}

function Test-WavFile {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return $false }
    $size = (Get-Item $Path).Length
    if ($size -lt 44) { return $false }
    return $true
}

function Convert-WavToMp3 {
    param([string]$WavPath, [string]$Mp3Path)
    try {
        $psi = New-Object System.Diagnostics.ProcessStartInfo
        $psi.FileName = $soxExe
        $psi.Arguments = "`"$WavPath`" -C 96 `"$Mp3Path`""
        $psi.UseShellExecute = $false
        $psi.CreateNoWindow = $true
        $psi.RedirectStandardOutput = $true
        $psi.RedirectStandardError = $true
        $p = [System.Diagnostics.Process]::Start($psi)
        $p.WaitForExit(10000)
        if ($p.ExitCode -eq 0 -and (Test-Path $Mp3Path)) {
            Add-Log "Конвертация WAV->MP3 успешна, размер: $((Get-Item $Mp3Path).Length) байт"
            return $true
        } else {
            Add-Log "Конвертация WAV->MP3 не удалась, код выхода: $($p.ExitCode)"
            return $false
        }
    } catch {
        Add-Log "Исключение при конвертации: $_"
        return $false
    }
}

function Show-VoiceRecording {
    $formVoice = New-Object System.Windows.Forms.Form
    $formVoice.Text = "Запись голоса"
    $formVoice.Size = New-Object System.Drawing.Size(750, 550)
    $formVoice.StartPosition = "CenterScreen"
    $formVoice.FormBorderStyle = "FixedDialog"
    $formVoice.MaximizeBox = $false
    $formVoice.MinimizeBox = $false
    $formVoice.BackColor = [System.Drawing.Color]::FromArgb(0, 0, 0)
    $formVoice.ControlBox = $false
    $formVoice.Icon = [System.Drawing.Icon]::ExtractAssociatedIcon([System.Windows.Forms.Application]::ExecutablePath)

    $title = New-Object System.Windows.Forms.Label
    $title.Text = "ЗАПИСЬ ГОЛОСА"
    $title.Location = New-Object System.Drawing.Point(0, 20)
    $title.Size = New-Object System.Drawing.Size(750, 30)
    $title.TextAlign = [System.Drawing.ContentAlignment]::MiddleCenter
    $title.ForeColor = [System.Drawing.Color]::FromArgb(255, 215, 0)
    $title.Font = New-Object System.Drawing.Font("Segoe UI", 16, [System.Drawing.FontStyle]::Bold)
    $formVoice.Controls.Add($title)

    $label = New-Object System.Windows.Forms.Label
    $label.Text = "Озвучьте следующий текст:"
    $label.Location = New-Object System.Drawing.Point(20, 70)
    $label.Size = New-Object System.Drawing.Size(710, 20)
    $label.TextAlign = [System.Drawing.ContentAlignment]::MiddleCenter
    $label.ForeColor = [System.Drawing.Color]::FromArgb(255, 215, 0)
    $label.Font = New-Object System.Drawing.Font("Segoe UI", 12, [System.Drawing.FontStyle]::Bold)
    $formVoice.Controls.Add($label)

    $scriptText = New-Object System.Windows.Forms.TextBox
    $scriptText.Multiline = $true
    $scriptText.Location = New-Object System.Drawing.Point(20, 100)
    $scriptText.Size = New-Object System.Drawing.Size(710, 300)
    $scriptText.BackColor = [System.Drawing.Color]::FromArgb(30, 30, 30)
    $scriptText.ForeColor = [System.Drawing.Color]::White
    $scriptText.Font = New-Object System.Drawing.Font("Segoe UI", 14)
    $scriptText.ReadOnly = $true
    $scriptText.BorderStyle = [System.Windows.Forms.BorderStyle]::FixedSingle
    $scriptText.ScrollBars = "Vertical"
    $scriptText.Text = @"
Добрый день! Техническая поддержка компании «СкайТелеком». 
Меня зовут (Дмитрий / Анастасия)

Давайте проверим, в чём может быть причина сбоя. 
Скажите, пожалуйста, вы уже перезагружали устройство?

Убедитесь, что все кабели подключены правильно, 
индикаторы горят, и соединение активно.

Сейчас я направлю сигнал на модем — это может занять до одной минуты. 
Пожалуйста, не выключайте оборудование.

Спасибо за ожидание! Попробуйте снова открыть страницу 
или перезапустить приложение. Работает?
"@
    $formVoice.Controls.Add($scriptText)

    $buttonRecord = New-Object System.Windows.Forms.Button
    $buttonRecord.Text = "Записать"
    $buttonRecord.Location = New-Object System.Drawing.Point(150, 420)
    $buttonRecord.Size = New-Object System.Drawing.Size(120, 40)
    $buttonRecord.BackColor = [System.Drawing.Color]::FromArgb(255, 215, 0)
    $buttonRecord.ForeColor = [System.Drawing.Color]::Black
    $buttonRecord.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
    $buttonRecord.Font = New-Object System.Drawing.Font("Segoe UI", 12, [System.Drawing.FontStyle]::Bold)
    $buttonRecord.Cursor = [System.Windows.Forms.Cursors]::Hand
    $formVoice.Controls.Add($buttonRecord)

    $buttonStop = New-Object System.Windows.Forms.Button
    $buttonStop.Text = "Стоп"
    $buttonStop.Location = New-Object System.Drawing.Point(290, 420)
    $buttonStop.Size = New-Object System.Drawing.Size(120, 40)
    $buttonStop.BackColor = [System.Drawing.Color]::FromArgb(255, 215, 0)
    $buttonStop.ForeColor = [System.Drawing.Color]::Black
    $buttonStop.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
    $buttonStop.Font = New-Object System.Drawing.Font("Segoe UI", 12, [System.Drawing.FontStyle]::Bold)
    $buttonStop.Enabled = $false
    $buttonStop.Cursor = [System.Windows.Forms.Cursors]::Hand
    $formVoice.Controls.Add($buttonStop)

    $buttonResult = New-Object System.Windows.Forms.Button
    $buttonResult.Text = "ПОЛУЧИТЬ РЕЗУЛЬТАТ"
    $buttonResult.Location = New-Object System.Drawing.Point(430, 420)
    $buttonResult.Size = New-Object System.Drawing.Size(250, 40)
    $buttonResult.BackColor = [System.Drawing.Color]::FromArgb(76, 175, 80)
    $buttonResult.ForeColor = [System.Drawing.Color]::White
    $buttonResult.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
    $buttonResult.Font = New-Object System.Drawing.Font("Segoe UI", 12, [System.Drawing.FontStyle]::Bold)
    $buttonResult.Cursor = [System.Windows.Forms.Cursors]::Hand
    $buttonResult.Enabled = $false
    $formVoice.Controls.Add($buttonResult)

    $status = New-Object System.Windows.Forms.Label
    $status.Text = "Готов к записи"
    $status.Location = New-Object System.Drawing.Point(20, 480)
    $status.Size = New-Object System.Drawing.Size(710, 30)
    $status.TextAlign = [System.Drawing.ContentAlignment]::MiddleCenter
    $status.ForeColor = [System.Drawing.Color]::LightGray
    $status.Font = New-Object System.Drawing.Font("Segoe UI", 12)
    $formVoice.Controls.Add($status)

    $blinkTimer = New-Object System.Windows.Forms.Timer
    $blinkTimer.Interval = 500
    $blinkState = $false

    $process = $null
    $global:isRecording = $false
    $script:recordingCompleted = $false

    function Kill-AllSoxProcesses {
        try {
            Get-Process -Name "sox" -ErrorAction SilentlyContinue | ForEach-Object {
                $_.Kill()
            }
        } catch {
            # Игнорируем ошибки
        }
    }

    $blinkTimer.Add_Tick({
        if ($global:isRecording) {
            $blinkState = -not $blinkState
            if ($blinkState) {
                $status.Text = "🔴 ИДЕТ ЗАПИСЬ, ГОВОРИТЕ 🔴"
                $status.ForeColor = [System.Drawing.Color]::Red
            } else {
                $status.Text = "ИДЕТ ЗАПИСЬ, ГОВОРИТЕ"
                $status.ForeColor = [System.Drawing.Color]::Red
            }
        }
    })

    $formVoice.Add_FormClosed({
        if (-not $script:recordingCompleted) {
            [System.Windows.Forms.Application]::Exit()
        }
    })

    $buttonRecord.Add_Click({
        $script:recordingCompleted = $false
        $status.Text = "ИДЕТ ЗАПИСЬ, ГОВОРИТЕ"
        $status.ForeColor = [System.Drawing.Color]::Red
        $buttonRecord.Enabled = $false
        $buttonStop.Enabled = $true
        $buttonResult.Enabled = $false
        $global:isRecording = $true
        $blinkTimer.Start()
        
        if (Test-Path $audioOutputPath) {
            Remove-Item $audioOutputPath -Force -ErrorAction SilentlyContinue
        }
        
        $psi = New-Object System.Diagnostics.ProcessStartInfo
        $psi.FileName = $soxExe
        $psi.Arguments = "-t waveaudio 0 `"$audioOutputPath`""
        $psi.UseShellExecute = $false
        $psi.CreateNoWindow = $true
        $psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
        $psi.RedirectStandardOutput = $true
        $psi.RedirectStandardError = $true
        
        $process = New-Object System.Diagnostics.Process
        $process.StartInfo = $psi
        $process.Start() | Out-Null
    })

    $buttonStop.Add_Click({
        $global:isRecording = $false
        $blinkTimer.Stop()
        
        $status.Text = "Завершение записи..."
        $status.ForeColor = [System.Drawing.Color]::LightGray
        
        if ($process -and -not $process.HasExited) {
            $process.CloseMainWindow()
            Start-Sleep -Milliseconds 500
            
            if (-not $process.HasExited) {
                $process.Kill()
            }
            
            $process.WaitForExit(2000) | Out-Null
        }
        
        Kill-AllSoxProcesses
        
        if (Test-WavFile -Path $audioOutputPath) {
            $status.Text = "Запись сохранена. Нажмите 'ПОЛУЧИТЬ РЕЗУЛЬТАТ'"
            $buttonResult.Enabled = $true
        } else {
            $status.Text = "Ошибка записи. Попробуйте снова."
            $buttonRecord.Enabled = $true
            $buttonStop.Enabled = $false
        }
        $status.ForeColor = [System.Drawing.Color]::LightGray
        $buttonStop.Enabled = $false
        $script:recordingCompleted = $true
    })

    $buttonResult.Add_Click({
        if (-not $script:recordingCompleted) {
            [System.Windows.Forms.MessageBox]::Show(
                "Сначала необходимо записать голосовое сообщение.",
                "Внимание",
                [System.Windows.Forms.MessageBoxButtons]::OK,
                [System.Windows.Forms.MessageBoxIcon]::Warning
            )
            return
        }
        
        if (Test-Path $audioOutputPath) {
            $global:voiceRecorded = $true
            $global:lastAudioFile = $audioOutputPath
            Show-Progress "Конвертация голосовой записи в MP3..."
            if (Convert-WavToMp3 -WavPath $audioOutputPath -Mp3Path $audioMp3Path) {
                $global:lastAudioFile = $audioMp3Path
                Add-Log "Голосовая запись сконвертирована в MP3"
            } else {
                Add-Log "Конвертация не удалась, используется WAV"
                # Оставляем WAV
            }
            Hide-Progress
        } else {
            $global:voiceRecorded = $false
        }
        $formVoice.Close()
    })

    $formVoice.Add_FormClosed({
        $blinkTimer.Stop()
        Kill-AllSoxProcesses
    })

    $formVoice.ShowDialog() | Out-Null
}

$global:voiceRecorded = $false
$global:lastAudioFile = $null
Show-VoiceRecording

# ===================== ПРОМЕЖУТОЧНОЕ ОКНО БЛАГОДАРНОСТИ =====================
$messageForm = New-Object System.Windows.Forms.Form
$messageForm.Text = "Спасибо"
$messageForm.Size = New-Object System.Drawing.Size(500, 180)
$messageForm.StartPosition = "CenterScreen"
$messageForm.FormBorderStyle = "FixedDialog"
$messageForm.MaximizeBox = $false
$messageForm.MinimizeBox = $false
$messageForm.BackColor = [System.Drawing.Color]::FromArgb(0, 0, 0)
$messageForm.ControlBox = $false
$messageForm.TopMost = $true

$messageLabel = New-Object System.Windows.Forms.Label
$messageLabel.Text = "Спасибо за прохождение теста.`nВаши ответы записаны.`nИдет проверка.`nЭто может занять до 10 минут."
$messageLabel.Location = New-Object System.Drawing.Point(20, 40)
$messageLabel.Size = New-Object System.Drawing.Size(460, 100)
$messageLabel.TextAlign = [System.Drawing.ContentAlignment]::MiddleCenter
$messageLabel.ForeColor = [System.Drawing.Color]::FromArgb(255, 215, 0)
$messageLabel.Font = New-Object System.Drawing.Font("Segoe UI", 12, [System.Drawing.FontStyle]::Bold)
$messageForm.Controls.Add($messageLabel)

$messageForm.Show()
[System.Windows.Forms.Application]::DoEvents()

# ===================== ТЕСТ СКОРОСТИ ИНТЕРНЕТА =====================
# Убираем вывод "Тест скорости интернета..." (просто удаляем строку Show-Progress)
Start-Sleep -Milliseconds 100

$internetResults = @()
$internetError = $null

$serverIDs = @(
    @{ City = "Ижевск"; ID = 17014 },
    @{ City = "Видное"; ID = 51387 },
    @{ City = "Кемерово"; ID = 27144 },
    @{ City = "Москва (fdcservers.net)"; ID = 46685 }
)

if (Test-Path $speedtestExe) {
    foreach ($server in $serverIDs) {
        $city = $server.City
        $serverId = $server.ID
        Add-Log "Тестируем сервер ${city} (ID $serverId)"
        try {
            $psi = New-Object System.Diagnostics.ProcessStartInfo
            $psi.FileName = $speedtestExe
            $psi.Arguments = "--accept-license --accept-gdpr --format=json --server-id $serverId"
            $psi.UseShellExecute = $false
            $psi.CreateNoWindow = $true
            $psi.RedirectStandardOutput = $true
            $psi.RedirectStandardError = $true
            $psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
        
            $p = New-Object System.Diagnostics.Process
            $p.StartInfo = $psi
            $p.Start() | Out-Null
        
            if ($p.WaitForExit(30000)) {
                $output = $p.StandardOutput.ReadToEnd()
                $errorOut = $p.StandardError.ReadToEnd()
                if ($p.ExitCode -eq 0) {
                    $result = $output | ConvertFrom-Json
                    $internetResults += @{
                        City = $city
                        Ping = $result.ping.latency
                        Download = $result.download.bandwidth / 125000
                        Upload = $result.upload.bandwidth / 125000
                        Server = $result.server.name
                    }
                    Add-Log "${city} успешен: ping=$($result.ping.latency)"
                } else {
                    $fullError = $output + $errorOut
                    $err = "speedtest для ${city} завершился с кодом $($p.ExitCode). Вывод: $fullError"
                    $internetResults += @{
                        City = $city
                        Error = $err
                    }
                    Add-Log "Ошибка для ${city}: $err"
                }
            } else {
                $p.Kill()
                $err = "speedtest для ${city} превысил время ожидания (30 сек)"
                $internetResults += @{
                    City = $city
                    Error = $err
                }
                Add-Log "$err"
            }
        } catch {
            $err = "Исключение при запуске speedtest для ${city}: $_"
            $internetResults += @{
                City = $city
                Error = $err
            }
            Add-Log "$err"
        }
    }
} else {
    $internetError = "speedtest.exe не найден в папке программы"
    Add-Log $internetError
}

# ===================== СОХРАНЕНИЕ ОТЧЁТОВ =====================
$jsonPath = Join-Path $scriptDir "results.json"
$reportPath = Join-Path $scriptDir "report.txt"

if (-not $global:typingResult) {
    $global:typingResult = @{
        Duration = 0
        Characters = 0
        Errors = 0
        CPM = 0
        Accuracy = 0
        TextIndex = -1
    }
}

$internetInfoForComparison = $null
foreach ($res in $internetResults) {
    if (-not $res.ContainsKey('Error')) {
        $internetInfoForComparison = $res
        break
    }
}

$resultCompare = Compare-WithRequirements -Hardware $hardware -NetworkType $networkType -InternetResult $internetInfoForComparison -Requirements $global:requirements -DefaultAudioInput $defaultAudio.Input
$verdict = $resultCompare.VerdictString
$issues = $resultCompare.Issues

$allData = @{
    candidateId      = $candidateCode
    hardware         = $hardware
    deviceType       = $deviceType
    audioDevices     = $audioDevices
    defaultAudioInput  = $defaultAudio.Input
    defaultAudioOutput = $defaultAudio.Output
    networkType      = $networkType
    typingTest       = $global:typingResult
    internetResults  = $internetResults
    internetError    = $internetError
    voiceRecorded    = if ($global:voiceRecorded) { $true } else { $false }
    voiceFile        = if ($global:lastAudioFile) { $global:lastAudioFile } else { $null }
    requirements     = $global:requirements
    verdict          = $verdict
    timestamp        = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
}

$allData | ConvertTo-Json -Depth 5 | Out-File -FilePath $jsonPath -Encoding UTF8

# Формируем текстовый отчёт
$reportContent = @"
========================================
       ОТЧЁТ О ПРОВЕРКЕ КОМПЬЮТЕРА
========================================
Идентификатор кандидата: $candidateCode
Дата и время теста:      $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")

--- ХАРАКТЕРИСТИКИ ПК ---
Тип устройства:          $deviceType
Процессор (CPU):         $($hardware.CPU)
Оперативная память (RAM): $($hardware.RAM)
Системный диск (C:):     $($hardware.SystemDisk)
Операционная система:    $($hardware.OS)

--- АУДИОУСТРОЙСТВА ---
"@

if ($audioDevices.Count -gt 0) {
    foreach ($dev in $audioDevices) {
        $reportContent += "Устройство: $($dev.Name)`n"
        $reportContent += "  Статус: $($dev.Status)`n"
        $reportContent += "  Тип подключения: $($dev.Type)`n"
        $reportContent += "  Назначение: $($dev.Capabilities)`n"
        $reportContent += "`n"
    }
} else {
    $reportContent += "Не удалось получить информацию об аудиоустройствах.`n"
}

$reportContent += @"
--- АКТИВНЫЕ АУДИОУСТРОЙСТВА (ПО УМОЛЧАНИЮ) ---
"@
if ($defaultAudio.Input) {
    $reportContent += "Устройство ввода:  $($defaultAudio.Input.Name) ($($defaultAudio.Input.Type)) [$($defaultAudio.Input.Status)]`n"
} else {
    $reportContent += "Устройство ввода:  Не определено`n"
}
if ($defaultAudio.Output) {
    $reportContent += "Устройство вывода: $($defaultAudio.Output.Name) ($($defaultAudio.Output.Type)) [$($defaultAudio.Output.Status)]`n"
} else {
    $reportContent += "Устройство вывода: Не определено`n"
}
$reportContent += @"

--- ТЕСТ СКОРОСТИ ПЕЧАТИ ---
Скорость печати:         $($global:typingResult.CPM) зн/мин
Ошибок:                  $($global:typingResult.Errors)
Точность:                $($global:typingResult.Accuracy)%
Время выполнения:        $([math]::Round($global:typingResult.Duration,1)) сек

--- ГОЛОСОВАЯ ЗАПИСЬ ---
Статус:                  $(if($global:voiceRecorded){'Выполнена'}else{'Не выполнена'})

--- ТИП ПОДКЛЮЧЕНИЯ К ИНТЕРНЕТУ ---
$networkType

--- РЕЗУЛЬТАТЫ ТЕСТА СКОРОСТИ ИНТЕРНЕТА (по городам) ---
"@

if ($internetResults.Count -gt 0) {
    foreach ($res in $internetResults) {
        if ($res.ContainsKey('Error')) {
            $reportContent += "$($res.City): Ошибка - $($res.Error)`n"
        } else {
            $reportContent += "$($res.City): Пинг $([math]::Round($res.Ping)) мс, Загрузка $([math]::Round($res.Download,2)) Мбит/с, Отдача $([math]::Round($res.Upload,2)) Мбит/с (сервер $($res.Server))`n"
        }
    }
} elseif ($internetError) {
    $reportContent += "Тест интернета не проводился: $internetError`n"
} else {
    $reportContent += "Нет данных о скорости интернета.`n"
}

$reportContent += @"

--- РЕЗУЛЬТАТ ПРОВЕРКИ ---
$verdict

========================================
"@

$reportContent | Out-File -FilePath $reportPath -Encoding UTF8

# ===================== ОТПРАВКА РЕЗУЛЬТАТОВ НА СЕРВЕР =====================
Add-Type -ReferencedAssemblies "System.Net.Http.dll" -TypeDefinition @"
using System;
using System.IO;
using System.Net.Http;
using System.Threading.Tasks;

public class MultipartUploader
{
    public static string UploadFiles(string url, string code, string reportPath, string resultsPath, string voicePath)
    {
        using (var client = new HttpClient())
        using (var formData = new MultipartFormDataContent())
        {
            formData.Add(new StringContent(code), "code");
            formData.Add(new StreamContent(File.OpenRead(reportPath)), "report", Path.GetFileName(reportPath));
            formData.Add(new StreamContent(File.OpenRead(resultsPath)), "results", Path.GetFileName(resultsPath));
            formData.Add(new StreamContent(File.OpenRead(voicePath)), "voice", Path.GetFileName(voicePath));

            var response = client.PostAsync(url, formData).Result;
            string responseBody = response.Content.ReadAsStringAsync().Result;

            if (response.IsSuccessStatusCode)
            {
                return responseBody;
            }
            else
            {
                throw new Exception("HTTP " + (int)response.StatusCode + ": " + responseBody);
            }
        }
    }
}
"@

function Submit-ResultsWithRetry {
    param(
        [string]$Code,
        [string]$ReportPath,
        [string]$ResultsPath,
        [string]$VoicePath,
        [int]$MaxRetries = 3
    )
    
    if ($masterKeyEnabled -and $Code -eq "ADMIN123") {
        return $true
    }
    
    $url = "https://grafic1.netlify.app/.netlify/functions/submitResults"
    
    $attempt = 0
    while ($attempt -lt $MaxRetries) {
        try {
            if (-not (Test-Path $ReportPath)) { throw "Файл отчёта не найден: $ReportPath" }
            if (-not (Test-Path $ResultsPath)) { throw "Файл результатов не найден: $ResultsPath" }
            if (-not (Test-Path $VoicePath)) { throw "Файл голоса не найден: $VoicePath" }
            
            $reportSize = (Get-Item $ReportPath).Length
            $resultsSize = (Get-Item $ResultsPath).Length
            $voiceSize = (Get-Item $VoicePath).Length
            Add-Log "Размеры: report=$reportSize, results=$resultsSize, voice=$voiceSize"
            Add-Log "Отправка для кода: $Code, попытка $($attempt+1)"
            
            $totalSize = $reportSize + $resultsSize + $voiceSize
            if ($totalSize -gt 10MB) {
                Add-Log "ОШИБКА: общий размер превышает 10 МБ ($totalSize байт)"
                return $false
            }
            
            Add-Log "Начинаем отправку на $url"
            $responseBody = [MultipartUploader]::UploadFiles($url, $Code, $ReportPath, $ResultsPath, $VoicePath)
            Add-Log "Успешно отправлено. Ответ: $responseBody"
            return $true
        } catch {
            $attempt++
            $errMsg = $_.ToString()
            Add-Log "Ошибка (попытка $attempt): $errMsg"
            if ($attempt -ge $MaxRetries) {
                return $false
            }
            Start-Sleep -Seconds (5 * $attempt)
        }
    }
    return $false
}

# Отправляем результаты
$submitted = Submit-ResultsWithRetry -Code $candidateCode -ReportPath $reportPath -ResultsPath $jsonPath -VoicePath $global:lastAudioFile

# Закрываем промежуточное окно после отправки
$messageForm.Close()

# ===================== ЛОКАЛЬНОЕ СОХРАНЕНИЕ ПРИ НЕУДАЧЕ =====================
if (-not $submitted) {
    $failDir = Join-Path $scriptDir "failed_submits"
    if (-not (Test-Path $failDir)) { New-Item -ItemType Directory -Path $failDir | Out-Null }
    $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
    Copy-Item $reportPath "$failDir\${candidateCode}_${timestamp}_report.txt"
    Copy-Item $jsonPath "$failDir\${candidateCode}_${timestamp}_results.json"
    if (Test-Path $global:lastAudioFile) {
        Copy-Item $global:lastAudioFile "$failDir\${candidateCode}_${timestamp}_voice.$(Split-Path $global:lastAudioFile -Extension)"
    }
    Add-Log "Данные сохранены локально в $failDir"
    [System.Windows.Forms.MessageBox]::Show(
        "Не удалось отправить данные на сервер. Результаты сохранены в папке `"failed_submits`". Свяжитесь с администратором.",
        "Ошибка отправки",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Error
    )
} else {
    Add-Log "Отправка успешна"
}

# ===================== ФИНАЛЬНОЕ ОКНО =====================
Hide-Progress

$finalForm = New-Object System.Windows.Forms.Form
$finalForm.Text = "Результат проверки"
$finalForm.Size = New-Object System.Drawing.Size(800, 550)
$finalForm.StartPosition = "CenterScreen"
$finalForm.FormBorderStyle = "FixedDialog"
$finalForm.MaximizeBox = $false
$finalForm.MinimizeBox = $false
$finalForm.BackColor = [System.Drawing.Color]::FromArgb(0, 0, 0)
$finalForm.ControlBox = $false
$finalForm.TopMost = $true
$finalForm.Icon = [System.Drawing.Icon]::ExtractAssociatedIcon([System.Windows.Forms.Application]::ExecutablePath)

$richMessage = New-Object System.Windows.Forms.RichTextBox
$richMessage.Location = New-Object System.Drawing.Point(20, 20)
$richMessage.Size = New-Object System.Drawing.Size(760, 450)
$richMessage.BackColor = [System.Drawing.Color]::FromArgb(0, 0, 0)
$richMessage.ForeColor = [System.Drawing.Color]::White
$richMessage.Font = New-Object System.Drawing.Font("Segoe UI", 11)
$richMessage.ReadOnly = $true
$richMessage.BorderStyle = [System.Windows.Forms.BorderStyle]::None
$richMessage.WordWrap = $true
$richMessage.ScrollBars = "Vertical"
$finalForm.Controls.Add($richMessage)

$buttonClose = New-Object System.Windows.Forms.Button
$buttonClose.Text = "Закрыть"
$buttonClose.Location = New-Object System.Drawing.Point(350, 480)
$buttonClose.Size = New-Object System.Drawing.Size(100, 30)
$buttonClose.BackColor = [System.Drawing.Color]::FromArgb(255, 215, 0)
$buttonClose.ForeColor = [System.Drawing.Color]::Black
$buttonClose.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
$buttonClose.Font = New-Object System.Drawing.Font("Segoe UI", 10)
$buttonClose.Cursor = [System.Windows.Forms.Cursors]::Hand
$finalForm.Controls.Add($buttonClose)

$buttonClose.Add_Click({
    $finalForm.Close()
    [System.Windows.Forms.Application]::Exit()
})

if ($issues.Count -eq 0) {
    if ($global:requirements) {
        $richMessage.Text = "✅ ПОДХОДИТ`n`nВсе технические требования проекта выполнены. Спасибо за прохождение проверки!"
    } else {
        $richMessage.Text = "ℹ️ ДАННЫЕ ОТПРАВЛЕНЫ`n`nХарактеристики проекта не заданы. Ожидайте решения HR-менеджера."
    }
} else {
    $message = "Благодарим вас за прохождение проверки. К сожалению, по ее результатам мы вынуждены сообщить, что ваше рабочее место не соответствует техническим требованиям, необходимым для выполнения задач.`n`n"
    $message += "Детализация причин:`n"
    
    $pcIssues = $issues | Where-Object { $_ -in @("OS", "RAM", "Cores") }
    if ($pcIssues.Count -gt 0) {
        $message += "• По характеристикам ПК: К сожалению, технические характеристики вашего устройства (в частности, объем оперативной памяти, количество ядер процессора и тактовая частота) не дотягивают до минимально необходимого уровня.`n"
    }
    
    if ($issues -contains "InternetSpeed") {
        $message += "• По скорости интернета: Зафиксированная скорость интернет-соединения ниже минимально допустимой для стабильной работы.`n"
    }
    
    if ($issues -contains "ConnectionType") {
        $message += "• По типу подключения к сети: Для обеспечения стабильной связи обязательно использование проводного подключения (LAN-кабель). В данный момент вы используете Wi-Fi, что не гарантирует надежности соединения.`n"
    }
    
    if ($issues -contains "AudioType") {
        $message += "• По типу подключения наушников: Для работы требуется гарнитура с USB-подключением. Обнаруженный тип подключения ваших наушников не соответствует этим требованиям.`n"
    }
    
    $message += "`nДля более подробной информацией напишите нам:`n"
    $message += "Вацап +7 909 373 9341`n"
    $message += "Телеграмм: @Rucontactservices"
    
    $richMessage.Text = $message
}

$finalForm.ShowDialog()
[System.Windows.Forms.Application]::Exit()