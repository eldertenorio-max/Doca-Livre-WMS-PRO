@echo off
title Liberar porta 5000 - Controle de Carregamento
echo.
echo ============================================================
echo   LIBERAR PORTA 5000 NO FIREWALL DO WINDOWS
echo   (Permite acesso ao sistema de outras maquinas na rede)
echo ============================================================
echo.

net session >nul 2>&1
if %errorLevel% neq 0 (
    echo   ERRO: Execute este arquivo como ADMINISTRADOR.
    echo   Clique com o botao direito em liberar_firewall.bat
    echo   e escolha "Executar como administrador".
    echo.
    pause
    exit /b 1
)

echo   Adicionando regra no Firewall do Windows (porta 5000 TCP)...
netsh advfirewall firewall delete rule name="Controle Carregamento Ultrapao" >nul 2>&1
netsh advfirewall firewall add rule name="Controle Carregamento Ultrapao" dir=in action=allow protocol=TCP localport=5000

if %errorLevel% equ 0 (
    echo.
    echo   OK. Porta 5000 liberada.
    echo   Outras maquinas podem acessar: http://SEU_IP:5000
    echo   Veja o IP na janela do programa ao iniciar o servidor.
) else (
    echo   Falha ao adicionar regra. Tente liberar manualmente:
    echo   Painel de Controle - Firewall - Configuracoes avancadas
    echo   - Regras de entrada - Nova regra - Porta - TCP 5000 - Permitir.
)
echo.
pause
