@echo off
TITLE MasaLink Print Bridge Daemon
cd /d "%~dp0\.."

:: Check if Node is available
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [HATA] Node.js sistemde bulunamadi! Lutfen Node.js kurunuz.
    pause
    exit /b 1
)

:: Run the print bridge daemon on port 28443
node scripts\masalink-print-bridge.js
