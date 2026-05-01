#!/usr/bin/env python3
"""
Parse /tmp/fixed_stock.xlsx and extract all cross-sell products
(rows under groups named *cross*), output to /tmp/cross_products.json
"""

import zipfile, json, re
from xml.etree import ElementTree as ET

XLSX = '/tmp/fixed_stock.xlsx'
OUT  = '/tmp/cross_products.json'

CROSS_SET_MAP = {
    'achyk asman cross':  'achyk-asman',
    'den sooluk cross':   'den-sooluk',
    'jenil ashkana cross':'jenil-ashkana',
    'kosh keliniz cross': 'kosh-keliniz',
    'onoy sakta cross':   'onoi-sakta',
    'sanarip tv cross':   'sanarip-tv',
    'taza kiyim cross':   'taza-kiym',
}

def get_indent(xf_idx, cell_xfs):
    try:
        xf = cell_xfs[xf_idx]
        al = xf.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}alignment')
        if al is not None:
            return int(al.get('indent', 0))
    except Exception:
        pass
    return 0

def main():
    zf = zipfile.ZipFile(XLSX)
    ns = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'

    # shared strings
    ss_tree = ET.parse(zf.open('xl/sharedStrings.xml'))
    shared = []
    for si in ss_tree.getroot().findall(f'{ns}si'):
        parts = []
        for t in si.iter(f'{ns}t'):
            if t.text:
                parts.append(t.text)
        shared.append(''.join(parts))

    # styles — collect cellXfs
    st_tree = ET.parse(zf.open('xl/styles.xml'))
    cell_xfs = st_tree.getroot().find(f'{ns}cellXfs')
    xfs = list(cell_xfs) if cell_xfs is not None else []

    # sheet1
    ws_tree = ET.parse(zf.open('xl/worksheets/sheet1.xml'))

    rows_data = []
    for row in ws_tree.getroot().iter(f'{ns}row'):
        cells = list(row)
        if not cells:
            continue
        first = cells[0]
        ctype = first.get('t', '')
        xf_idx = int(first.get('s', 0))
        indent = get_indent(xf_idx, xfs)

        v_el = first.find(f'{ns}v')
        val = ''
        if v_el is not None and v_el.text:
            if ctype == 's':
                val = shared[int(v_el.text)]
            else:
                val = v_el.text

        # qty from second cell if present
        qty = None
        if len(cells) > 1:
            q_el = cells[1].find(f'{ns}v')
            if q_el is not None and q_el.text:
                try:
                    qty = float(q_el.text)
                except ValueError:
                    pass

        rows_data.append({'name': val.strip(), 'indent': indent, 'qty': qty})

    # extract products under cross groups
    # a cross group header has indent 6 and name matches *cross*
    products = []
    current_cross_set = None

    for i, r in enumerate(rows_data):
        name_lo = r['name'].lower()
        # detect cross group header (indent 6, contains 'cross')
        if r['indent'] == 6 and 'cross' in name_lo:
            current_cross_set = None
            for key, slug in CROSS_SET_MAP.items():
                if key in name_lo:
                    current_cross_set = slug
                    break
            continue

        # if we're inside a cross group, collect leaf products
        if current_cross_set:
            # stop if indent goes back to ≤ 6 (new group or section)
            if r['indent'] <= 6 and r['name']:
                current_cross_set = None
                continue
            # leaf: next row has indent ≤ current
            is_leaf = True
            if i + 1 < len(rows_data):
                if rows_data[i + 1]['indent'] > r['indent']:
                    is_leaf = False
            if is_leaf and r['name']:
                products.append({
                    'name':  r['name'],
                    'set':   current_cross_set,
                    'brand': 'matkasym-home',
                    'qty':   r['qty'],
                })

    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(products, f, ensure_ascii=False, indent=2)

    print(f'Extracted {len(products)} cross products → {OUT}')
    by_set = {}
    for p in products:
        by_set.setdefault(p['set'], []).append(p['name'])
    for s, names in sorted(by_set.items()):
        print(f'  {s}: {len(names)} products')

if __name__ == '__main__':
    main()
