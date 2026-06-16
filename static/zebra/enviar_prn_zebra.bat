@echo off
chcp 65001 >nul
setlocal
if "%~1"=="" (
    echo Arraste o arquivo .prn sobre este .bat
    echo Ou: enviar_prn_zebra.bat "C:\Downloads\longarina.prn"
    pause
    exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0enviar_prn_zebra.ps1" -Arquivo "%~1"
echo.
pause
