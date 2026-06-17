# Envia ZPL (.txt / .prn) para impressora Zebra — RAW (60x40 mm, sem Chrome).
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$Arquivo
)

$ErrorActionPreference = 'Stop'

function Write-Err($msg) {
    Write-Host $msg -ForegroundColor Red
}

function Write-Ok($msg) {
    Write-Host $msg -ForegroundColor Green
}

try {
    if (-not (Test-Path -LiteralPath $Arquivo)) {
        Write-Err "ERRO: arquivo nao encontrado:"
        Write-Host "  $Arquivo"
        exit 1
    }

    $caminho = (Resolve-Path -LiteralPath $Arquivo).Path
    $bytes = [System.IO.File]::ReadAllBytes($caminho)
    if ($bytes.Length -eq 0) {
        Write-Err 'ERRO: arquivo vazio.'
        exit 1
    }

    Write-Host "Arquivo: $caminho ($($bytes.Length) bytes)"

    $printers = @()
    try {
        $printers = @(Get-Printer -ErrorAction Stop | Where-Object {
            $_.Name -match 'ZDesigner|ZD220|ZD230|Zebra'
        })
    } catch {
        $printers = @(Get-CimInstance Win32_Printer -ErrorAction SilentlyContinue | Where-Object {
            $_.Name -match 'ZDesigner|ZD220|ZD230|Zebra'
        } | ForEach-Object {
            [PSCustomObject]@{ Name = $_.Name; PortName = $_.PortName }
        })
    }

    if ($printers.Count -eq 0) {
        Write-Err 'Nenhuma impressora Zebra encontrada no Windows.'
        Write-Host ''
        Write-Host 'Impressoras instaladas:'
        try {
            Get-Printer | Format-Table Name, PortName, DriverName -AutoSize
        } catch {
            Get-CimInstance Win32_Printer | Select-Object Name, PortName, DriverName | Format-Table -AutoSize
        }
        Write-Host 'Instale o driver ZDesigner ZD220 e conecte a impressora por USB.'
        exit 1
    }

    $printer = $null
    if ($printers.Count -eq 1) {
        $printer = $printers[0]
    } else {
        Write-Host ''
        Write-Host 'Impressoras Zebra encontradas:'
        for ($i = 0; $i -lt $printers.Count; $i++) {
            Write-Host "  [$i] $($printers[$i].Name)  (porta: $($printers[$i].PortName))"
        }
        Write-Host ''
        $sel = Read-Host 'Digite o numero da impressora'
        $idx = 0
        if (-not [int]::TryParse($sel, [ref]$idx) -or $idx -lt 0 -or $idx -ge $printers.Count) {
            Write-Err 'Numero invalido.'
            exit 1
        }
        $printer = $printers[$idx]
    }

    $porta = [string]$printer.PortName
    $nome = [string]$printer.Name
    Write-Host ''
    Write-Host "Impressora: $nome"
    Write-Host "Porta: $porta"

  if (-not ([System.Management.Automation.PSTypeName]'WmsZebraRawPrint').Type) {
    Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WmsZebraRawPrint {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public struct DOCINFOA {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }
    [DllImport("winspool.drv", EntryPoint="OpenPrinterA", SetLastError=true, CharSet=CharSet.Ansi)]
    public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);
    [DllImport("winspool.drv", SetLastError=true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", EntryPoint="StartDocPrinterA", SetLastError=true, CharSet=CharSet.Ansi)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, int level, ref DOCINFOA di);
    [DllImport("winspool.drv", SetLastError=true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", SetLastError=true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", SetLastError=true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", SetLastError=true)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);
    public static bool Send(string printerName, byte[] data) {
        IntPtr h = IntPtr.Zero;
        if (!OpenPrinter(printerName, out h, IntPtr.Zero)) return false;
        try {
            var di = new DOCINFOA();
            di.pDocName = "WMS ZPL";
            di.pOutputFile = null;
            di.pDataType = "RAW";
            if (!StartDocPrinter(h, 1, ref di)) return false;
            try {
                if (!StartPagePrinter(h)) return false;
                IntPtr buf = Marshal.AllocCoTaskMem(data.Length);
                try {
                    Marshal.Copy(data, 0, buf, data.Length);
                    int written;
                    if (!WritePrinter(h, buf, data.Length, out written)) return false;
                } finally { Marshal.FreeCoTaskMem(buf); }
                EndPagePrinter(h);
            } finally { EndDocPrinter(h); }
        } finally { ClosePrinter(h); }
        return true;
    }
}
"@
    }

    Write-Host 'Enviando ZPL (modo RAW)...'
    $ok = [WmsZebraRawPrint]::Send($nome, $bytes)

    if (-not $ok -and $porta) {
        $destPorta = $porta
        if ($destPorta -notmatch '^\\\\') {
            if ($destPorta -match '^USB\d+$') { $destPorta = "\\.\$destPorta" }
            elseif ($destPorta -notmatch '^\\\\\.\\') { $destPorta = "\\.\$destPorta" }
        }
        Write-Host "Falha RAW. Tentando copy /b na porta $destPorta ..."
        $psi = New-Object System.Diagnostics.ProcessStartInfo
        $psi.FileName = 'cmd.exe'
        $psi.Arguments = "/c copy /b `"$caminho`" `"$destPorta`""
        $psi.UseShellExecute = $false
        $psi.CreateNoWindow = $true
        $p = [System.Diagnostics.Process]::Start($psi)
        $p.WaitForExit()
        if ($p.ExitCode -eq 0) { $ok = $true }
    }

    if (-not $ok) {
        Write-Err 'ERRO: nao foi possivel enviar para a impressora.'
        Write-Host 'Verifique: USB conectado, impressora ligada, driver ZDesigner ZD220 instalado.'
        exit 1
    }

    Write-Ok 'OK — etiqueta enviada. Confira na impressora.'
    exit 0
} catch {
    Write-Err "ERRO: $($_.Exception.Message)"
    exit 1
}
