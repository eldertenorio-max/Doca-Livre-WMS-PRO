@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================================
echo    CONTROLE DE CARREGAMENTO ULTRAPAO - PAINEL WEB
echo ============================================================
echo.

REM Usar "py" se "python" nao for encontrado (comum no Windows)
where python >nul 2>nul
if %errorlevel% neq 0 (
    where py >nul 2>nul
    if %errorlevel% neq 0 (
        echo ERRO: Python nao encontrado. Instale o Python e adicione ao PATH.
        echo Ou execute pelo prompt: py -3 -m pip install -r requirements.txt
        pause
        exit /b 1
    )
    set PYCMD=py -3
) else (
    set PYCMD=python
)

echo Verificando dependencias...
%PYCMD% -c "import flask" 2>nul
if errorlevel 1 (
    echo Flask nao encontrado. Instalando dependencias...
    %PYCMD% -m pip install -r requirements.txt
    if errorlevel 1 (
        echo ERRO ao instalar dependencias. Verifique se o pip esta disponivel.
        pause
        exit /b 1
    )
)

if not exist "app.py" (
    echo ERRO: app.py nao encontrado nesta pasta: %cd%
    pause
    exit /b 1
)

echo.
echo Iniciando servidor na pasta: %cd%
start "Servidor - Controle de Carregamento" cmd /k "set PORT=5001 && %PYCMD% app.py"
echo.
echo Aguardando servidor subir...
timeout /t 3 /nobreak >nul
echo Abrindo navegador...
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" "http://127.0.0.1:5001/"
) else if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" "http://127.0.0.1:5001/"
) else if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" (
    start "" "%LocalAppData%\Google\Chrome\Application\chrome.exe" "http://127.0.0.1:5001/"
) else (
    start "" "http://127.0.0.1:5001/"
)
echo.
echo Navegador aberto. Para parar o servidor, feche a janela "Servidor - Controle de Carregamento".
echo Se a pagina nao carregar, veja se ha erros na janela do servidor.
echo ============================================================
pause
