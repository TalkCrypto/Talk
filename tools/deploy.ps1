# ============================================================================
#  Talk — deploy a la VPS (nginx)
#
#  Uso:
#    .\tools\deploy.ps1 -Host 203.0.113.10 -User root -RemotePath /var/www/talkwhitall
#    .\tools\deploy.ps1 -Server root@203.0.113.10:/var/www/talkwhitall -DryRun
#
#  Sube el contenido de web/ a la carpeta del sitio y después verifica contra el
#  dominio que el app.js servido sea el nuevo (tamaño y firma del arreglo).
# ============================================================================
param(
  [Parameter(Mandatory = $false)] [string]$Server,      # user@host:/ruta/remota
  [string]$Host, [string]$User = "root", [string]$RemotePath = "/var/www/talkwhitall",
  [string]$Key = "$env:USERPROFILE\.ssh\id_ed25519",
  [string]$Domain = "talkwhitall.com",
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$web = Join-Path $PSScriptRoot "..\web"
$web = (Resolve-Path $web).Path

if (-not $Server) {
  if (-not $Host) { throw "Falta -Host (o -Server user@host:/ruta)" }
  $Server = "$User@$Host`:$RemotePath"
}
$sshTarget = ($Server -split ":")[0]
$remoteDir = ($Server -split ":")[1]

$localJs = Get-Item (Join-Path $web "app.js")
"local  app.js : {0:N0} B" -f $localJs.Length
"destino       : $Server"

if ($DryRun) {
  "--- DRY RUN: se subiría esto"
  Get-ChildItem $web -File | Where-Object { $_.Name -notmatch '^\.' } |
    ForEach-Object { "  {0,-18} {1,7:N0} B" -f $_.Name, $_.Length }
  return
}

"--- subiendo $(($files = Get-ChildItem $web -File | Where-Object { $_.Name -notmatch '^\.' }).Count) archivos…"
foreach ($f in $files) {
  & scp -i $Key -o StrictHostKeyChecking=accept-new $f.FullName "$($sshTarget):$remoteDir/$($f.Name)"
  if ($LASTEXITCODE -ne 0) { throw "falló la subida de $($f.Name)" }
}
"--- permisos y recarga de nginx"
& ssh -i $Key $sshTarget "chmod -R 755 '$remoteDir' && chmod 644 '$remoteDir'/* && (nginx -t && systemctl reload nginx || true)"
if ($LASTEXITCODE -ne 0) { throw "falló el remoto (permisos/nginx)" }

"--- verificando contra https://$Domain"
Start-Sleep -Seconds 2
$h = @{ "User-Agent" = "Mozilla/5.0"; "Cache-Control" = "no-cache" }
$live = (Invoke-WebRequest "https://$Domain/app.js?v=$(Get-Random)" -Headers $h -TimeoutSec 30).Content
"live   app.js : {0:N0} B" -f $live.Length
$okSize = $live.Length -eq $localJs.Length
$okFix  = $live.Contains("function provider(")
"tamaño igual  : $okSize"
"con el arreglo: $okFix"
if ($okSize -and $okFix) { "DEPLOY OK" } else { "OJO: el servidor no está sirviendo el archivo nuevo (¿otra ruta? ¿otro vhost?)"; exit 2 }
