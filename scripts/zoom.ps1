# Dev helper: save a zoomed-in crop of an image (to inspect borders pixel by pixel).
# Usage: powershell -File scripts/zoom.ps1 <image> <x> <y> <w> <h> <zoom> <out.png>
param([string]$Image, [int]$X, [int]$Y, [int]$W, [int]$H, [int]$Zoom, [string]$Out)
Add-Type -AssemblyName System.Drawing
$src = [System.Drawing.Bitmap]::FromFile((Resolve-Path $Image))
$img = New-Object System.Drawing.Bitmap ($W * $Zoom), ($H * $Zoom)
$g = [System.Drawing.Graphics]::FromImage($img)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
$g.DrawImage($src, (New-Object System.Drawing.Rectangle 0, 0, ($W * $Zoom), ($H * $Zoom)), (New-Object System.Drawing.Rectangle $X, $Y, $W, $H), [System.Drawing.GraphicsUnit]::Pixel)
$img.Save($Out)
$src.Dispose()
