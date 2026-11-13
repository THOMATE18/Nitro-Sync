# ========================================================
# NITRO SYNC - Permitir el puerto de Expo en el firewall
# ========================================================
#
# Ejecuta:  npm run firewall
#
# (Se pedirá permiso de administrador automáticamente.)
#
# Windows Firewall puede bloquear las conexiones entrantes
# del celular hacia Metro (puerto 8081). Esta regla permite
# ese puerto para que el celular pueda abrir:
#
#   - La app en Expo Go  ->  exp://IP_DEL_PC:8081
#   - La versión web     ->  http://IP_DEL_PC:8081
#
# IMPORTANTE:
#   Si la red Wi-Fi está marcada como "Pública", Windows
#   bloquea la entrada aunque exista la regla. Por eso la
#   regla se crea para los perfiles Privado y Público.
# ========================================================

$nombre = 'Expo/Metro - puerto 8081 (entrante)'

$esAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator
)

if (-not $esAdmin) {
  Write-Host 'Se necesitan permisos de administrador.' -ForegroundColor Yellow
  Write-Host 'Se abrirá una ventana nueva y te pedirá permiso...' -ForegroundColor Yellow
  Start-Process powershell -Verb RunAs -ArgumentList @(
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', "`"$PSCommandPath`""
  )
  exit
}

$regla = Get-NetFirewallRule -DisplayName $nombre -ErrorAction SilentlyContinue

if ($regla) {
  # La regla ya existe: solo nos aseguramos de que cubra
  # también las redes marcadas como "Pública".
  Set-NetFirewallRule -DisplayName $nombre -Enabled True -Profile Private, Public | Out-Null
  Write-Host "La regla '$nombre' ya existía. Se actualizó para redes Privada y Pública." -ForegroundColor Green
} else {
  New-NetFirewallRule `
    -DisplayName $nombre `
    -Direction Inbound `
    -Protocol TCP `
    -LocalPort 8081 `
    -Action Allow `
    -Profile Private, Public | Out-Null

  Write-Host 'Regla creada: se permite el puerto 8081 en redes Privada y Pública.' -ForegroundColor Green
}

# Datos útiles para abrir la app desde el celular.
$ip = (
  Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object {
      $_.IPAddress -notlike '127.*' -and
      $_.IPAddress -notlike '169.254.*' -and
      $_.IPAddress -ne '0.0.0.0' -and
      $_.InterfaceAlias -match 'Wi-?Fi|Wireless|WLAN'
    } |
    Select-Object -First 1
).IPAddress

$perfil = Get-NetConnectionProfile |
  Where-Object { $_.InterfaceAlias -match 'Wi-?Fi|Wireless|WLAN' } |
  Select-Object -First 1

if ($ip) {
  Write-Host ''
  Write-Host "Abre en el navegador del celular:  http://${ip}:8081" -ForegroundColor Cyan
  Write-Host "O escanea el QR de Expo Go:          exp://${ip}:8081" -ForegroundColor Cyan
}

if ($perfil -and $perfil.NetworkCategory -ne 'Private') {
  Write-Host ''
  Write-Host "Aviso: tu red '$($perfil.Name)' está como '$($perfil.NetworkCategory)'." -ForegroundColor Yellow
  Write-Host 'La regla ya cubre ese perfil, pero si el celular no conecta' -ForegroundColor Yellow
  Write-Host "puedes cambiarla a Privada con:  Set-NetConnectionProfile -Name `"$($perfil.Name)`" -NetworkCategory Private" -ForegroundColor Yellow
}

Write-Host ''
Write-Host 'Listo. Puedes cerrar esta ventana.' -ForegroundColor Green
