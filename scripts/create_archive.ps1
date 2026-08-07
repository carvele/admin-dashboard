$SourceFolder = "C:\Users\carlv\Desktop\admin-dashboard"
$DestinationZip = "C:\Users\carlv\Desktop\finals_section_group#.zip"

$ExcludeList = @(
    ".git",
    "node_modules",
    "dist",
    ".firebase",
    "*.zip"
)

Write-Host "Zipping project folder to $DestinationZip..."
Write-Host "Excluding heavy folders like node_modules, .git, and dist."

# We need to create a temporary folder to copy the files we want, then zip that folder, 
# because Compress-Archive doesn't easily support excluding complex directory trees in PowerShell 5.1
$TempFolder = Join-Path -Path $env:TEMP -ChildPath "admin-dashboard-archive"

if (Test-Path $TempFolder) {
    Remove-Item -Path $TempFolder -Recurse -Force
}

New-Item -ItemType Directory -Path $TempFolder | Out-Null

# Copy files, excluding the unwanted directories
Get-ChildItem -Path $SourceFolder | Where-Object { $_.Name -notin $ExcludeList } | Copy-Item -Destination $TempFolder -Recurse -Force

# Zip the temp folder
if (Test-Path $DestinationZip) {
    Remove-Item -Path $DestinationZip -Force
}

Compress-Archive -Path "$TempFolder\*" -DestinationPath $DestinationZip

# Clean up
Remove-Item -Path $TempFolder -Recurse -Force

Write-Host "Archive created successfully at $DestinationZip!"
