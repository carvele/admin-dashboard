const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        fs.statSync(dirPath).isDirectory() ? walkDir(dirPath, callback) : callback(dirPath);
    });
}

const COLOR_MAP = {
    // Legacy Pink/Rose overlap palette being wiped for Gold/Charcoal
    '#e17fa0': 'var(--accent)',
    '#c95d80': 'var(--highlight)',
    '#f3c6d5': 'var(--border-color)',
    '#fdf0f4': 'var(--beige)',
    '#fff5f8': 'var(--cream)',
    
    // Generic grays/whites being brought to the main aesthetic
    '#fafafa': 'var(--cream)',
    '#e2e8f0': 'var(--border-color)',
    
    // UI Signal overlaps
    '#dc2626': 'var(--stock-low)',
    '#fee2e2': 'var(--status-cancelled-bg)',
    '#10b981': 'var(--stock-high)',
    '#d1fae5': 'var(--status-completed-bg)',
    '#fef3c7': 'var(--status-pending-bg)',

    // Generic RGBA structural
    'rgba(0, 0, 0, 0.05)': 'rgba(31, 28, 24, 0.05)',
    'rgba(0, 0, 0, 0.1)': 'rgba(31, 28, 24, 0.1)',
    'rgba(255, 255, 255, 0.1)': 'var(--glass-border)',
};

walkDir('src', function(filePath) {
    if (filePath.endsWith('.css') && !filePath.includes('index.css')) {
        let content = fs.readFileSync(filePath, 'utf8');
        let originalContent = content;

        for (const [rawColor, cssVar] of Object.entries(COLOR_MAP)) {
            // Case insensitive replace for the raw literal
            const regex = new RegExp(rawColor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
            content = content.replace(regex, cssVar);
        }

        if (content !== originalContent) {
            fs.writeFileSync(filePath, content, 'utf8');
            console.log(`Unified Colors: ${filePath}`);
        }
    }
});
