; Inno Setup - Controle de Carregamento Ultrapão
; Compilar com: "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" instalador.iss

#define MyAppName "Controle de Carregamento Ultrapão"
#define MyAppVersion "1.0"
#define MyAppPublisher "Ultra Pão Alimentos"
#define MyAppExeName "ControleCarregamento.exe"
#define MyAppOutput "dist\ControleCarregamento"

[Setup]
AppId={{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\ControleCarregamentoUltrapao
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=.
OutputBaseFilename=Instalador_Controle_Carregamento_Ultrapao
SetupIconFile=
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible x86compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "portuguese"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Criar ícone na área de trabalho"; GroupDescription: "Ícones adicionais:"; Flags: unchecked

[Files]
Source: "{#MyAppOutput}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Comment: "Abre o painel de Controle de Carregamento"
Name: "{group}\Desinstalar {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon; Comment: "Abre o painel de Controle de Carregamento"

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Abrir {#MyAppName} agora"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: dirifempty; Name: "{app}"

[Code]
function InitializeSetup(): Boolean;
begin
  Result := True;
end;
