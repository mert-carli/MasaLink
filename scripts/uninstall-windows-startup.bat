@echo off
TITLE MasaLink Print Bridge - Baslangictan Kaldir
set STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
set SHORTCUT_PATH=%STARTUP_DIR%\MasaLink-Print-Bridge.lnk

echo MasaLink Print Bridge baslangictan kaldiriliyor...
if exist "%SHORTCUT_PATH%" (
    del /f /q "%SHORTCUT_PATH%"
    echo [BASARILI] Kisayol baslangic klasorunden silindi.
) else (
    echo [BILGI] Kisayol zaten baslangic klasorunde bulunmuyor.
)

pause
