@echo off
chcp 65001 >nul
setlocal EnableExtensions
title WMS - Imprimir etiqueta Zebra
cd /d "%~dp0"

echo.
echo ============================================
echo   IMPRESSAO ZEBRA WMS (60x40 mm)
echo ============================================
echo.

if "%~1"=="" (
    echo ERRO: Nenhum arquivo recebido.
    echo.
    echo Como usar:
    echo   1. Baixe a pasta impressora-zebra-wms.zip e extraia
    echo   2. Arraste o arquivo .txt EM CIMA deste .bat
    echo.
    echo IMPORTANTE: o .bat e o .ps1 devem estar na MESMA pasta.
    echo Pasta atual: %~dp0
    echo.
    pause
    exit /b 1
)

if not exist "%~dp0enviar_prn_zebra.ps1" (
    echo ERRO: Falta o arquivo enviar_prn_zebra.ps1 nesta pasta:
    echo   %~dp0
    echo.
    echo Baixe o ZIP completo em:
    echo   https://sistema-wms.onrender.com/static/zebra/impressora-zebra-wms.zip
    echo.
    echo Extraia os dois arquivos juntos antes de usar.
    echo.
    pause
    exit /b 1
)

echo Arquivo recebido:
echo   %~1
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0enviar_prn_zebra.ps1" -Arquivo "%~1"
set EXITCODE=%ERRORLEVEL%

echo.
if not "%EXITCODE%"=="0" (
    echo [FALHOU] Codigo %EXITCODE%
) else (
    echo [CONCLUIDO] Verifique a etiqueta na impressora.
)
echo.
pause
exit /b %EXITCODE%
