import os

files = [
    'src/pages/wardrobe/ARAssets.jsx',
    'src/components/AR/GarmentIngestionModal.jsx',
    'src/utils/garmentIngestor.ts',
    'src/types/garment.ts'
]

output = "# Admin Dashboard - AR Source Code\n\n"

for f in files:
    if os.path.exists(f):
        ext = f.split('.')[-1]
        with open(f, 'r', encoding='utf-8') as file:
            content = file.read()
        output += f"### File: `{f}`\n```{ext}\n{content}\n```\n\n"

with open(r"C:\Users\carlv\.gemini\antigravity\brain\eaa180a0-fe22-49de-981c-51b58496874c\admin_ar_source_audit.md", 'w', encoding='utf-8') as out:
    out.write(output)

print("done")
