"""
Generates simple PNG icons for the Chrome extension using only Python stdlib.
Run: python setup_icons.py
"""
import struct, zlib, os

def make_png(size, bg=(37, 99, 235), fg=(255, 255, 255)):
    """Create a solid-colour PNG with a centred 'P' drawn pixel-art style."""
    # Pixel art letter 'P' at various scales
    P_PIXELS = [
        (1,0),(2,0),(3,0),
        (0,0),(0,1),(0,2),(0,3),(0,4),
        (1,2),(2,2),(3,1),
    ]
    scale = max(1, size // 16)
    letter_size = 5 * scale
    offset_x = (size - 4 * scale) // 2
    offset_y = (size - 5 * scale) // 2

    # Build pixel grid
    grid = [[bg] * size for _ in range(size)]
    for (px, py) in P_PIXELS:
        for dy in range(scale):
            for dx in range(scale):
                rx = offset_x + px * scale + dx
                ry = offset_y + py * scale + dy
                if 0 <= rx < size and 0 <= ry < size:
                    grid[ry][rx] = fg

    def chunk(name, data):
        n = name if isinstance(name, bytes) else name.encode()
        crc = zlib.crc32(n + data) & 0xFFFFFFFF
        return struct.pack('>I', len(data)) + n + data + struct.pack('>I', crc)

    sig   = b'\x89PNG\r\n\x1a\n'
    ihdr  = chunk('IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))
    raw   = bytearray()
    for row in grid:
        raw.append(0)            # filter byte
        for r, g, b in row:
            raw += bytes([r, g, b])
    idat  = chunk('IDAT', zlib.compress(bytes(raw), 9))
    iend  = chunk('IEND', b'')

    return sig + ihdr + idat + iend

if __name__ == '__main__':
    os.makedirs('icons', exist_ok=True)
    for sz in (16, 32, 48, 128):
        path = f'icons/icon{sz}.png'
        with open(path, 'wb') as f:
            f.write(make_png(sz))
        print(f'  Created {path}')
    print('Icons generated.')
