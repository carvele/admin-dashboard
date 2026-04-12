const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function walkDir(dir, callback) {
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
    });
}

const Z_INDEX_MAP = [
    { max: 49, var: 'var(--z-base)' },
    { max: 99, var: 'var(--z-dropdown)' },
    { max: 199, var: 'var(--z-sticky)' },
    { max: 299, var: 'var(--z-sidebar)' },
    { max: 399, var: 'var(--z-overlay)' },
    { max: 499, var: 'var(--z-modal)' },
    { max: 999, var: 'var(--z-popover)' },
    { max: 99999, var: 'var(--z-toast)' }
];

function getZIndexToken(value) {
    if (value < 0) return 'var(--z-negative)';
    for (let map of Z_INDEX_MAP) {
        if (value <= map.max) return map.var;
    }
    return 'var(--z-toast)';
}

walkDir('src', function(filePath) {
    if (filePath.endsWith('.css') && !filePath.includes('index.css')) {
        let content = fs.readFileSync(filePath, 'utf8');
        let originalContent = content;

        // Replace z-index declarations natively
        content = content.replace(/z-index:\s*(-?\d+)\s*;/g, (match, p1) => {
            const val = parseInt(p1);
            return `z-index: ${getZIndexToken(val)};`;
        });

        // Replace Breakpoint overlaps:
        // Convert arbitrary max-widths to standard
        content = content.replace(/@media\s*\(\s*max-width:\s*(600|640|900)px\s*\)/g, (match, p1) => {
            if (p1 === '600' || p1 === '640') return `@media (max-width: 768px)`;
            if (p1 === '900') return `@media (max-width: 1024px)`;
            return match;
        });

        if (content !== originalContent) {
            fs.writeFileSync(filePath, content, 'utf8');
            console.log(`Modified: ${filePath}`);
        }
    }
});
