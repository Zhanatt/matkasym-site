import fitz  # PyMuPDF
import pdfplumber
import re
import json
import os

PDF_PATH = '/Users/zhanat/Downloads/оптовые цены с картинками.pdf'
COMPRESSED_PATH = '/Users/zhanat/Downloads/оптовые_цены_сжатый.pdf'
OUTPUT_DIR = '/tmp/pdf_product_images'

os.makedirs(OUTPUT_DIR, exist_ok=True)

# Step 1: Extract product names with page numbers from compressed PDF (text)
print('Extracting product names and pages...')
plumber = pdfplumber.open(COMPRESSED_PATH)

page_products = {}  # page_num -> list of product names
for i, page in enumerate(plumber.pages):
    tables = page.extract_tables()
    prods = []
    for table in tables:
        for row in table:
            if not row or len(row) < 3:
                continue
            name_cell = None
            for cell in row:
                if cell and 'Цена:' in str(cell):
                    name_cell = cell
                    break
            if not name_cell:
                continue
            lines = name_cell.strip().split('\n')
            name_lines = []
            for line in lines:
                line = line.strip()
                if re.match(r'Цена:\s*', line):
                    continue
                if re.match(r'^\d+\s+шт', line):
                    continue
                if line in ('Штрихкод', 'Наименование', 'Оптовая KGS'):
                    continue
                name_lines.append(line)
            if name_lines:
                name = ' '.join(name_lines).strip()
                name = re.sub(r'\s+\d+\s+шт$', '', name)
                name = re.sub(r'\s+-?\d+\s+шт$', '', name)
                name = re.sub(r'\s+шт$', '', name)
                prods.append(name)
    if prods:
        page_products[i] = prods

plumber.close()
total_prods = sum(len(v) for v in page_products.values())
print(f'Found {total_prods} products across {len(page_products)} pages')

# Step 2: Extract images from original PDF, map to product names
print('Extracting images from original PDF...')
doc = fitz.open(PDF_PATH)

product_images = {}  # product_name -> image_path
for page_num, names in page_products.items():
    if page_num >= doc.page_count:
        continue
    page = doc[page_num]
    images = page.get_images()
    # Filter out tiny images (1x1 decorative)
    real_images = []
    for img in images:
        xref = img[0]
        pix = fitz.Pixmap(doc, xref)
        if pix.width > 50 and pix.height > 50:
            real_images.append((xref, pix))
        else:
            del pix

    # Match images to products in order
    for idx, name in enumerate(names):
        if idx < len(real_images):
            xref, pix = real_images[idx]
            # Convert CMYK to RGB if needed
            if pix.colorspace and pix.colorspace.n > 3:
                pix = fitz.Pixmap(fitz.csRGB, pix)

            safe_name = re.sub(r'[^\w\s-]', '', name)[:80].strip()
            img_path = os.path.join(OUTPUT_DIR, f'{safe_name}_{page_num}_{idx}.jpg')
            pix.save(img_path)
            product_images[name] = img_path
            del pix

    # Clean up
    for _, pix in real_images:
        del pix

doc.close()
print(f'Extracted {len(product_images)} product images')

# Save mapping
with open('/tmp/pdf_product_images.json', 'w') as f:
    json.dump(product_images, f, ensure_ascii=False, indent=2)

print(f'Image mapping saved to /tmp/pdf_product_images.json')
