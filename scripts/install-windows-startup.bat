@echo off
setlocal
TITLE MasaLink Print Bridge - Windows Otomatik Baslangic Kurulumu

echo ======================================================================
echo    MASALINK PRINT BRIDGE - WINDOWS STARTUP OTOMATIK BASLATICI
echo ======================================================================
echo.

set SCRIPT_DIR=%~dp0
set VBS_TARGET=%SCRIPT_DIR%masalink-bridge-silent.vbs
set STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
set SHORTCUT_PATH=%STARTUP_DIR%\MasaLink-Print-Bridge.lnk

echo [1/3] Dosya yollari dogrulaniyor...
if not exist "%VBS_TARGET%" (
    echo [HATA] %VBS_TARGET% dosyasi bulunamadi!
    pause
    exit /b 1
)

echo [2/3] Windows Baslangic (shell:startup) kisayolu olusturuluyor...
powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT_PATH%'); $s.TargetPath = 'wscript.exe'; $s.Arguments = '\"%VBS_TARGET%\"'; $s.WorkingDirectory = '%SCRIPT_DIR%'; $s.Description = 'MasaLink 80mm ESC/POS Donanim Koprusu'; $s.Save()"

if %ERRORLEVEL% EQU 0 (
    echo [BASARILI] Kisayol olusturuldu: %SHORTCUT_PATH%
) else (
    echo [UYARI] Kisayol olusturulamadi, dogrudan kopyalaniyor...
    copy /Y "%VBS_TARGET%" "%STARTUP_DIR%\"
)

echo [3/3] Servis simdi arka planda baslatiliyor...
wscript.exe "%VBS_TARGET%"

echo.
echo ======================================================================
echo TEBRIKLER! Kurulum basariyla tamamlandi.
echo Kasadaki bilgisayar her acildiginda MasaLink Print Bridge sessizce
echo arka planda baslayacak; ekranda hicbir siyah pencere acilmayacaktir.
echo ======================================================================
echo.
pause
