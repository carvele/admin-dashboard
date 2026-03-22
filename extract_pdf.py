import fitz
import sys

pdf_path = sys.argv[1]
doc = fitz.open(pdf_path)

for i in range(len(doc)):
    page = doc.load_page(i)
    pix = page.get_pixmap()
    output = f"UIsample_page_{i}.png"
    pix.save(output)
    print(f"Saved {output}")
