# Instalador - Controle de Carregamento Ultrapão

## Gerar o instalador (no PC de desenvolvimento)

1. **Requisitos**
   - Python 3.8+ com as dependências instaladas (`pip install -r requirements.txt`)
   - PyInstaller (`pip install pyinstaller`)
   - Inno Setup 6 (opcional, para criar o .exe instalador): https://jrsoftware.org/isdl.php

2. **Gerar**
   - Execute: **`build_instalador.bat`**
   - Será gerada a pasta **`dist\ControleCarregamento`** com o executável e, se o Inno Setup estiver instalado, o arquivo **`Instalador_Controle_Carregamento_Ultrapao.exe`**.

3. **Sem Inno Setup**
   - Você pode usar só a pasta **`dist\ControleCarregamento`**: copie essa pasta inteira para qualquer PC e execute **`ControleCarregamento.exe`**. O navegador abrirá em http://127.0.0.1:5000.

---

## Instalar em qualquer PC

### Opção A – Usando o instalador (.exe)

1. Envie o arquivo **`Instalador_Controle_Carregamento_Ultrapao.exe`** para o PC.
2. Execute o instalador (pode ser necessário “Executar como administrador”).
3. Siga o assistente e escolha a pasta de instalação (padrão: Programas).
4. Ao terminar, marque “Abrir Controle de Carregamento agora” para abrir o programa.
5. O atalho ficará no Menu Iniciar em **Controle de Carregamento Ultrapão**.

### Opção B – Sem instalador (pasta portátil)

1. Copie a pasta **`ControleCarregamento`** (dentro de `dist`) para o PC ou pen drive.
2. Execute **`ControleCarregamento.exe`**.
3. O navegador abrirá automaticamente no painel.

---

## Onde ficam os dados no PC instalado

- **Banco de dados e uploads:**  
  `%APPDATA%\ControleCarregamentoUltrapao\`  
  (ex.: `C:\Users\SeuUsuario\AppData\Roaming\ControleCarregamentoUltrapao\`)

- **Planilha Excel:**  
  Coloque a planilha (ex.: CONTROLE DE CARREGAMENTO ULTRAPAO.xlsx) em um destes locais:
  - Na mesma pasta do executável (ex.: `C:\Program Files\ControleCarregamentoUltrapao\`)
  - Na pasta de dados acima
  - Ou na pasta de onde você abriu o programa

---

## Encerrar o programa

Feche a janela preta (console) que abriu ao iniciar o programa. Isso encerra o servidor. Para usar de novo, execute o atalho ou o .exe novamente.
