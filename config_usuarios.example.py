# -*- coding: utf-8 -*-
# ============================================================
# Controle de usuários do sistema
# ============================================================
# Edite a lista USUARIOS e reinicie o app.
# Formato: {"usuario": "nome", "senha": "senha_em_texto"}
# As senhas são automaticamente convertidas em hash no banco.
# ============================================================

USUARIOS = [
    {"usuario": "admin", "senha": "admin"},
    # {"usuario": "operador1", "senha": "senha123"},
    # {"usuario": "conferente", "senha": "senha456"},
]

# IMPORTANTE: Após fazer alterações:
# 1. Salve este arquivo
# 2. Reinicie o app (o sistema sincroniza automaticamente)
# 3. Usuários removidos desta lista serão excluídos do banco
