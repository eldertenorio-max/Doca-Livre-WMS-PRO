@echo off
chcp 65001 >nul
echo ============================================================
echo   GERAR INSTALADOR - CONTROLE DE CARREGAMENTO ULTRAPAO
echo ============================================================
echo.

where pyinstaller >nul 2>nul
if errorlevel 1 (
    echo [1/3] Instalando PyInstaller...
    pip install pyinstaller
) else (
    echo [1/3] PyInstaller encontrado.
)
echo.

echo [2/3] Gerando executavel com PyInstaller (pode demorar 1-2 min)...
pyinstaller --noconfirm ControleCarregamento.spec
if errorlevel 1 (
    echo ERRO ao rodar PyInstaller.
    pause
    exit /b 1
)
echo.

set ISCC="C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
if not exist %ISCC% set ISCC="C:\Program Files\Inno Setup 6\ISCC.exe"
if not exist %ISCC% (
    echo [3/3] Inno Setup nao encontrado.
    echo.
    echo O executavel foi gerado em: dist\ControleCarregamento\
    echo Voce pode copiar essa pasta para qualquer PC e executar
    echo   ControleCarregamento.exe
    echo.
    echo Para criar o instalador .exe, instale o Inno Setup 6:
    echo   https://jrsoftware.org/isdl.php
    echo Depois execute: %ISCC% instalador.iss
    pause
    exit /b 0
)

echo [3/3] Criando instalador Windows...
%ISCC% instalador.iss
if errorlevel 1 (
    echo ERRO ao criar instalador.
    pause
    exit /b 1
)

echo.
echo ============================================================
echo   PRONTO!
echo ============================================================
echo   Instalador gerado: Instalador_Controle_Carregamento_Ultrapao.exe
echo   Envie esse arquivo para instalar em qualquer PC com Windows.
echo ============================================================
pause
