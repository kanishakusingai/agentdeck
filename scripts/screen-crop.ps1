# Dev helper: photograph the real screen and save zoomed crops (for checking borders pixel by pixel).
# Usage: powershell -File scripts/screen-crop.ps1 -Out <dir> -Crops "name:x,y,w,h,zoom;name2:..."
param([string]$Out = $env:TEMP, [string]$Crops = 'full:0,0,1920,1080,1')
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class DpiAware { [DllImport("user32.dll")] public static extern bool SetProcessDPIAware(); }'
[DpiAware]::SetProcessDPIAware() | Out-Null
$screen = New-Object System.Drawing.Bitmap 1920, 1080
[System.Drawing.Graphics]::FromImage($screen).CopyFromScreen(0, 0, 0, 0, $screen.Size)
foreach ($spec in $Crops.Split(';')) {
  $name, $nums = $spec.Split(':')
  $x, $y, $w, $h, $z = $nums.Split(',') | ForEach-Object { [int]$_ }
  $img = New-Object System.Drawing.Bitmap ($w * $z), ($h * $z)
  $g = [System.Drawing.Graphics]::FromImage($img)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
  $g.DrawImage($screen, (New-Object System.Drawing.Rectangle 0, 0, ($w * $z), ($h * $z)), (New-Object System.Drawing.Rectangle $x, $y, $w, $h), [System.Drawing.GraphicsUnit]::Pixel)
  $path = Join-Path $Out "$name.png"
  $img.Save($path)
  $path
}
