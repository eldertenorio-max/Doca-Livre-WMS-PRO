#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Lê config_usuarios.py e gera SQL com senhas em hash para inserir no Supabase.
"""
import importlib.util
import os
from werkzeug.security import generate_password_hash

def main():
    config_path = 'config_usuarios.py'
    if not os.path.isfile(config_path):
        print(f"Erro: {config_path} não encontrado")
        return
    
    # Carregar config_usuarios.py
    spec = importlib.util.spec_from_file_location('config_usuarios', config_path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    lista = getattr(mod, 'USUARIOS', [])
    
    if not lista:
        print("Erro: USUARIOS vazio em config_usuarios.py")
        return
    
    print(f"Total de usuários em config_usuarios.py: {len(lista)}")
    
    usuarios = []
    for item in lista:
        if not isinstance(item, dict):
            continue
        usuario = (item.get('usuario') or '').strip()
        senha = item.get('senha') or ''
        if not usuario:
            continue
        
        # Gerar hash da senha (mesmo método usado no app.py)
        senha_hash = generate_password_hash(senha, method='pbkdf2:sha256')
        
        usuarios.append({
            'usuario': usuario.replace("'", "''"),
            'senha_hash': senha_hash.replace("'", "''")
        })
    
    print(f"Usuários processados: {len(usuarios)}")
    
    # Gerar SQL
    output_file = os.path.join('supabase', 'insert_usuarios_data.sql')
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write('-- ============================================================\n')
        f.write('-- DADOS: Usuários (do config_usuarios.py)\n')
        f.write('-- ============================================================\n')
        f.write(f'-- Total: {len(usuarios)} usuários\n')
        f.write('-- Senhas em hash (pbkdf2:sha256)\n')
        f.write('-- Execute no SQL Editor do Supabase\n')
        f.write('-- ============================================================\n\n')
        
        f.write('insert into public.usuarios (usuario, senha_hash, ativo) values\n')
        for i, u in enumerate(usuarios):
            virgula = ',' if i < len(usuarios) - 1 else ''
            linha = f"  ('{u['usuario']}', '{u['senha_hash']}', true){virgula}\n"
            f.write(linha)
        f.write('on conflict (usuario) do nothing;\n')
    
    print(f'Arquivo gerado: {output_file}')
    print(f'Cole o conteúdo no SQL Editor do Supabase.')

if __name__ == '__main__':
    main()
