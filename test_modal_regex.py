
import os
import re

def process_file(filepath):
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    # Find the modal-overlay div. We need to be careful with nested divs.
    # Actually, a simpler way is: if the file uses modal-overlay, we can just look for the first `<div className="modal-overlay"` and its corresponding `</div>`.
    # Writing a robust bracket matcher in Python:
    
    start_idx = content.find("<div\n          className=\"modal-overlay\"")
    if start_idx == -1:
        start_idx = content.find("<div className=\"modal-overlay\"")
    
    if start_idx != -1:
        print(f"Found in {filepath}")

for root, _, files in os.walk("src/pages"):
    for file in files:
        if file.endswith(".jsx"):
            process_file(os.path.join(root, file))

