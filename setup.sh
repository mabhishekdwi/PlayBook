#!/usr/bin/env bash
set -e

echo "============================================="
echo "  Playbook  – Setup Script"
echo "============================================="

mkdir -p lib

echo "Downloading libraries…"
curl -L "https://cdn.quilljs.com/1.3.7/quill.min.js"              -o "lib/quill.min.js"
curl -L "https://cdn.quilljs.com/1.3.7/quill.snow.css"             -o "lib/quill.snow.css"
curl -L "https://cdn.jsdelivr.net/npm/sortablejs@1.15.2/Sortable.min.js" -o "lib/Sortable.min.js"
curl -L "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js" -o "lib/html2pdf.bundle.min.js"

echo "Generating icons…"
python3 setup_icons.py || python setup_icons.py

echo ""
echo "============================================="
echo " Done! Now:"
echo "  1. Open Chrome → chrome://extensions"
echo "  2. Enable 'Developer mode' (top-right)"
echo "  3. Click 'Load unpacked'"
echo "  4. Select this folder"
echo "============================================="
