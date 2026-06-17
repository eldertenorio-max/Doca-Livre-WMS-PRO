# Envia ZPL (.txt / .prn) para impressora Zebra — metodo RAW (ignora driver Chrome).
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$Arquivo
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $Arquivo)) {
    Write-Host "ERRO: arquivo nao encontrado: $Arquivo" -ForegroundColor Red
    exit 1
}

$caminho = (Resolve-Path -LiteralPath $Arquivo).Path
$bytes = [System.IO.File]::ReadAllBytes($caminho)

Add-Type @"
using System;
using System.IO;
using System.Runtime.InteropServices;
public class ZebraRawPrint {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
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

$printers = @(Get-Printer -ErrorAction SilentlyContinue | Where-Object {
    $_.Name -match 'ZDesigner|ZD220|ZD230|Zebra'
})

if ($printers.Count -eq 0) {
    Write-Host "Nenhuma impressora Zebra encontrada. Instale o driver ZDesigner ZD220." -ForegroundColor Yellow
    Get-Printer -ErrorAction SilentlyContinue | Format-Table Name, PortName -AutoSize
    exit 1
}

$printer = if ($printers.Count -eq 1) { $printers[0] } else {
    Write-Host "Impressoras Zebra:"
    for ($i = 0; $i -lt $printers.Count; $i++) {
        Write-Host "  [$i] $($printers[$i].Name)"
    }
    $idx = [int](Read-Host "Numero")
    $printers[$idx]
}

Write-Host "Enviando $caminho para $($printer.Name) (RAW)..."
$ok = [ZebraRawPrint]::Send($printer.Name, $bytes)
if (-not $ok) {
    Write-Host "Falha RAW. Tentando copy /b na porta $($printer.PortName)..."
    $null = cmd /c "copy /b `"$caminho`" $($printer.PortName)"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERRO ao imprimir." -ForegroundColor Red
        exit 1
    }
}
Write-Host "OK — etiqueta(s) enviada(s)." -ForegroundColor Green
