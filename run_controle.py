# Launcher para o Controle de Carregamento (usado pelo instalador PyInstaller)
import sys
import os
import webbrowser
import threading
import time
import socket

def obter_ips_locais():
    """Retorna uma lista de IPs locais da máquina (para acesso de outras máquinas na rede)."""
    ips = []
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.5)
        s.connect(('8.8.8.8', 80))
        ips.append(s.getsockname()[0])
        s.close()
    except Exception:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if not ip.startswith('127.') and ip not in ips:
                ips.append(ip)
    except Exception:
        pass
    return ips if ips else ['(execute liberar_firewall.bat como Administrador e verifique o IP no painel de rede)']

def abrir_navegador():
    time.sleep(1.8)
    webbrowser.open('http://127.0.0.1:5000')

if __name__ == '__main__':
    if getattr(sys, 'frozen', False):
        os.chdir(os.path.dirname(sys.executable))
    import app
    app.init_db()
    app.sync_usuarios_from_config()
    ips = obter_ips_locais()
    print('=' * 60)
    print('  CONTROLE DE CARREGAMENTO ULTRAPAO')
    print('=' * 60)
    print('  Nesta maquina (mesmo PC):  http://127.0.0.1:5000')
    print('  Ou:                       http://localhost:5000')
    for ip in ips:
        if not ip.startswith('('):
            print('  Em outra maquina na rede:  http://' + ip + ':5000')
    print('  Para parar: feche esta janela.')
    print('  Se outra maquina nao abrir: execute liberar_firewall.bat como Administrador.')
    print('=' * 60)
    threading.Thread(target=abrir_navegador, daemon=True).start()
    app.app.run(host='0.0.0.0', port=5000, debug=False, use_reloader=False, threaded=True)
