# CONTROLE DE CARREGAMENTO ULTRAPÃO - Painel Web

Sistema web completo para controle de carregamento com todas as funcionalidades da planilha Excel.

## 🚀 Como Iniciar

### 1. Instalar Dependências

```bash
pip install -r requirements.txt
```

### 2. Executar o Servidor

```bash
python app.py
```

### 3. Acessar o Painel

Abra seu navegador e acesse:
```
http://localhost:5000
```

## 📋 Funcionalidades

### ✅ ABA PAINEL
- Resumo geral com estatísticas em tempo real
- Total de itens bipados
- Total de itens carregados
- Total de itens únicos
- Total de divergências
- Estatísticas por veículo

### ✅ ABA BASE
- Cadastro de produtos bipados
- Campos: Código de Barras, Produto, Quantidade, Veículo, Status
- Edição e exclusão de produtos
- Validação de dados
- Atualização automática

### ✅ ABA CONFERÊNCIA
- Lista consolidada sem repetir códigos de barras
- Soma automática de quantidades
- Mostra última data/hora e veículo
- Atualização em tempo real

### ✅ ABA EXTRATO
- Lista apenas itens com status "CARREGADO"
- Relação completa de tudo que foi bipado e carregado
- Filtro automático

### ✅ ABA ROMANEIO POR ITEM
- Comparação entre quantidade bipada e romaneio
- Campo editável para inserir quantidade do romaneio
- Cálculo automático de diferença
- Status: OK, SOBRA ou FALTA
- Formatação condicional por cores

### ✅ ABA DIVERGÊNCIAS
- Lista automática de todas as divergências
- Filtra apenas itens com diferença diferente de zero
- Destaque visual para problemas

## 🎨 Recursos

- ✅ Interface moderna e responsiva
- ✅ Atualização automática a cada 5 segundos
- ✅ Foco automático no campo de código de barras
- ✅ Validação de formulários
- ✅ Mensagens de sucesso/erro
- ✅ Banco de dados SQLite local
- ✅ Sem necessidade de instalação complexa

## 📝 Como Usar

### Cadastrar Produto
1. Vá para a aba **BASE**
2. Digite o código de barras (ou pressione qualquer tecla para focar no campo)
3. Preencha os demais campos
4. Selecione o status (PENDENTE, CARREGADO ou CANCELADO)
5. Clique em "Adicionar Produto"

### Conferir Itens
1. Vá para a aba **CONFERÊNCIA**
2. Veja a lista consolidada sem repetições
3. Quantidades são somadas automaticamente

### Ver Itens Carregados
1. Vá para a aba **EXTRATO**
2. Veja apenas os itens com status "CARREGADO"

### Comparar com Romaneio
1. Vá para a aba **ROMANEIO POR ITEM**
2. Insira a quantidade do romaneio na coluna correspondente
3. A diferença e status são calculados automaticamente

### Ver Divergências
1. Vá para a aba **DIVERGÊNCIAS**
2. Veja automaticamente todas as diferenças encontradas

## 🔧 Tecnologias

- **Backend**: Flask (Python)
- **Frontend**: HTML5, CSS3, JavaScript (Vanilla)
- **Banco de Dados**: SQLite
- **Estilo**: Design moderno com gradientes e animações

## 📦 Estrutura de Arquivos

```
CONTROLE DE CARREGAMENTO/
├── app.py                 # Aplicação Flask principal
├── requirements.txt      # Dependências Python
├── controle_carregamento.db  # Banco de dados SQLite (criado automaticamente)
├── templates/
│   └── index.html        # Template HTML principal
└── static/
    ├── style.css         # Estilos CSS
    └── script.js         # JavaScript com toda a lógica
```

## 🛠️ Solução de Problemas

### Porta 5000 já em uso
Se a porta 5000 estiver ocupada, edite o arquivo `app.py` e altere:
```python
app.run(debug=True, host='0.0.0.0', port=5000)
```
Para outra porta, por exemplo:
```python
app.run(debug=True, host='0.0.0.0', port=8080)
```

### Erro ao instalar Flask
Certifique-se de ter Python 3.7+ instalado:
```bash
python --version
```

### Banco de dados não criado
O banco de dados é criado automaticamente na primeira execução. Se houver problemas, delete o arquivo `controle_carregamento.db` e execute novamente.

## 📞 Suporte

Para problemas ou dúvidas, verifique:
1. Se o servidor está rodando
2. Se todas as dependências estão instaladas
3. Se o navegador está acessando a URL correta
4. Console do navegador (F12) para erros JavaScript

---

**Desenvolvido para facilitar o controle de carregamento Ultrapão**
