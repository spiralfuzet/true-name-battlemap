/**
 * Hex Map Battlemap
 * Handles hex grid logic, rendering, and interaction.
 */

const canvas = document.getElementById('hex-canvas');
const ctx = canvas.getContext('2d');
const toggleBtn = document.getElementById('orientation-toggle');
const btnText = document.getElementById('btn-text');
const orientationStatus = document.getElementById('orientation-status'); // Likely null if footer removed? Check usage.
const ringCountInput = document.getElementById('ring-count');
const ringCountVal = document.getElementById('ring-count-val');

const placeUnitBtn = document.getElementById('place-unit-btn');
const placeMarkerBtn = document.getElementById('place-marker-btn');
const placeNumberBtn = document.getElementById('place-number-btn');
const placeArrowBtn = document.getElementById('place-arrow-btn');
const gridToolBtn = document.getElementById('grid-tool-btn');
const gridOptions = document.getElementById('grid-options');
const unitActions = document.getElementById('unit-actions');
const moveBtn = document.getElementById('move-btn');
const paintBtn = document.getElementById('paint-btn');
const rotateCCWBtn = document.getElementById('rotate-ccw-btn');
const rotateCWBtn = document.getElementById('rotate-cw-btn');
const deleteBtn = document.getElementById('delete-btn');
const closeBtn = document.getElementById('close-btn');
const paintOptions = document.getElementById('paint-options');
const auraColorInput = document.getElementById('aura-color');
const auraOpacityInput = document.getElementById('aura-opacity');
const numberOptions = document.getElementById('number-options');
const numberInput = document.getElementById('number-input');

// Area Controls
const areaToggle = document.getElementById('area-toggle');
const areaRadiusInput = document.getElementById('area-radius');

// Configuration
const CONFIG = {
    hexSize: 30, // Radius of the hex (center to corner)
    mapRadius: 10, // Number of rings
    gap: 0, // Space between hexes
    colors: {
        background: '#ffffff',
        line: '#000000',
        lineActive: '#666666',
        fill: '#ffffff',
        fillHover: '#e5e5e5'
    },
    defaultColors: ['#3b82f6', '#ef4444', '#06b6d4', '#10b981', '#f59e0b', '#8b5cf6'] // Blue, Red, Cyan, Green, Amber, Violet
};

// State
let state = {
    orientation: 'POINTY', // 'POINTY' or 'FLAT'
    hoveredHex: null,
    width: window.innerWidth,
    height: window.innerHeight,
    camera: { x: 0, y: 0, zoom: 1 },
    swordsmen: [], // Array of objects {q,r,s, rotation, aura: [], color, auraOpacity, showArea: bool, areaRadius: number}
    markers: [], // Array of objects {q,r,s, color, opacity}
    numbers: [], // Array of objects {q,r,s, value}
    arrows: [], // Array of objects {from: {q,r,s}, to: {q,r,s}, color}
    mode: 'VIEW', // 'VIEW', 'PLACE_UNIT', 'PLACE_MARKER', 'PLACE_NUMBER', 'PLACE_ARROW', 'GRID_SETTINGS'
    selectedUnitIndex: -1,
    isMoving: false,
    isPainting: false,
    nextColorIndex: 0,
    arrowStart: null // {q,r,s} temporary 
};

// --- Hex Math (Cube Coordinates: q, r, s) ---
// Constraint: q + r + s = 0

function hexAdd(a, b) {
    return { q: a.q + b.q, r: a.r + b.r, s: a.s + b.s };
}

function hexScale(hex, k) {
    return { q: hex.q * k, r: hex.r * k, s: hex.s * k };
}

function hexNeighbor(hex, direction) {
    const directions = [
        { q: 1, r: -1, s: 0 }, { q: 1, r: 0, s: -1 }, { q: 0, r: 1, s: -1 },
        { q: -1, r: 1, s: 0 }, { q: -1, r: 0, s: 1 }, { q: 0, r: -1, s: 1 }
    ];
    return hexAdd(hex, directions[direction]);
}

function hexRotate60(hex) {
    // Rotate 60 degrees CW: (q, r, s) -> (-r, -s, -q)
    return { q: -hex.r, r: -hex.s, s: -hex.q };
}

function hexRotate(hex, times) {
    let h = hex;
    const t = (times % 6 + 6) % 6; // Normalize
    for (let i = 0; i < t; i++) {
        h = hexRotate60(h);
    }
    return h;
}

function hexSubtract(a, b) {
    return { q: a.q - b.q, r: a.r - b.r, s: a.s - b.s };
}

// Generate spiral of hexes
function generateMap(radius) {
    let hexes = [];
    // Center
    hexes.push({ q: 0, r: 0, s: 0 });

    for (let currentRadius = 1; currentRadius <= radius; currentRadius++) {
        // Correct Ring algo:
        const directions = [
            { q: 1, r: -1, s: 0 }, { q: 1, r: 0, s: -1 }, { q: 0, r: 1, s: -1 },
            { q: -1, r: 1, s: 0 }, { q: -1, r: 0, s: 1 }, { q: 0, r: -1, s: 1 },
        ];

        // Start at direction 4 * radius
        let startDir = directions[4];
        let cursor = hexScale(startDir, currentRadius);

        for (let i = 0; i < 6; i++) {
            for (let j = 0; j < currentRadius; j++) {
                hexes.push(cursor);
                cursor = hexAdd(cursor, directions[i]);
            }
        }
    }
    return hexes;
}

// Generate Ring Only
function generateRing(centerHex, radius) {
    if (radius === 0) return [centerHex];

    let hexes = [];
    const directions = [
        { q: 1, r: -1, s: 0 }, { q: 1, r: 0, s: -1 }, { q: 0, r: 1, s: -1 },
        { q: -1, r: 1, s: 0 }, { q: -1, r: 0, s: 1 }, { q: 0, r: -1, s: 1 },
    ];

    let startDir = directions[4];
    let cursor = hexScale(startDir, radius);

    // Relative, add center
    cursor = hexAdd(centerHex, cursor);

    for (let i = 0; i < 6; i++) {
        for (let j = 0; j < radius; j++) {
            hexes.push(cursor);
            cursor = hexNeighbor(cursor, i); // Logic check: neighbor adds direction[i] to cursor
        }
    }
    return hexes;
}

// --- Layout & Pixel Conversion ---

function hexToPixel(hex) {
    const size = CONFIG.hexSize;
    let x, y;
    if (state.orientation === 'POINTY') {
        x = size * (Math.sqrt(3) * hex.q + Math.sqrt(3) / 2 * hex.r);
        y = size * (3 / 2 * hex.r);
    } else { // FLAT
        x = size * (3 / 2 * hex.q);
        y = size * (Math.sqrt(3) / 2 * hex.q + Math.sqrt(3) * hex.r);
    }
    return { x, y };
}

// Simple rounding for pixel->hex (not strictly needed for just rendering, but needed for interaction)

// --- Rendering ---

function drawHex(hex, center, style = {}) {
    const { x, y } = hexToPixel(hex);
    const pixelX = center.x + x;
    const pixelY = center.y + y;

    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const theta = (state.orientation === 'POINTY' ? 30 : 0) + 60 * i;
        const rad = Math.PI / 180 * theta;
        const px = pixelX + (CONFIG.hexSize - CONFIG.gap / 2) * Math.cos(rad);
        const py = pixelY + (CONFIG.hexSize - CONFIG.gap / 2) * Math.sin(rad);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    ctx.closePath();

    if (style.strokeOnly) {
        ctx.strokeStyle = style.strokeStyle || '#333';
        ctx.lineWidth = style.lineWidth || 1;
        ctx.stroke();
        return;
    }

    ctx.fillStyle = (style && style.fillStyle) ? style.fillStyle : CONFIG.colors.fill;
    ctx.fill();

    // Check if this hex is a valid move target (neighbor of selected)
    let isMoveTarget = false;
    if (state.selectedUnitIndex !== -1 && state.isMoving) {
        const selectedUnit = state.swordsmen[state.selectedUnitIndex];
        // Check distance = 1
        const dq = Math.abs(selectedUnit.q - hex.q);
        const dr = Math.abs(selectedUnit.r - hex.r);
        const ds = Math.abs(selectedUnit.s - hex.s);
        if ((dq + dr + ds) === 2) { // Distance 1 in cube coords
            isMoveTarget = true;
        }
    }

    // Glow effect
    if (isMoveTarget) {
        ctx.strokeStyle = '#10b981'; // Green
        ctx.lineWidth = 2;
    } else {
        ctx.strokeStyle = CONFIG.colors.line;
        ctx.lineWidth = 1;
    }
    ctx.stroke();

    if (isMoveTarget) {
        ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
        ctx.fill();
    }
}

function drawUnitArea(unit, center) {
    if (!unit.showArea || !unit.areaRadius || unit.areaRadius < 1) return;

    for (let r = 1; r <= unit.areaRadius; r++) {
        const ringHexes = generateRing(unit, r);
        ringHexes.forEach(hex => {
            drawHex(hex, center, {
                strokeOnly: true,
                strokeStyle: unit.color || '#333',
                lineWidth: 2
            });
        });
    }
}

function render() {
    // Clear
    ctx.fillStyle = CONFIG.colors.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const center = { x: canvas.width / 2, y: canvas.height / 2 };
    const hexes = generateMap(CONFIG.mapRadius); // Efficiency: could cache this if it doesn't change

    hexes.forEach(hex => {
        drawHex(hex, center);
    });

    // Draw Area Rings (Under markers/units)
    state.swordsmen.forEach(unit => {
        drawUnitArea(unit, center);
    });

    // Draw Markers
    state.markers.forEach(marker => {
        const { x, y } = hexToPixel(marker);
        const pixelX = center.x + x;
        const pixelY = center.y + y;
        const rgb = hexToRgb(marker.color || '#3b82f6');
        const fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${marker.opacity || 0.5})`;

        ctx.beginPath();
        // Circle marker (like swordsman selection but no stroke)
        ctx.arc(pixelX, pixelY, CONFIG.hexSize * 0.8, 0, Math.PI * 2);
        ctx.fillStyle = fillStyle;
        ctx.fill();
    });

    // Draw Arrows (Below swordsmen/numbers, above grid?) 
    state.arrows.forEach(arrow => {
        drawArrow(arrow, center);
    });

    // Draw Auras
    state.swordsmen.forEach(unit => {
        if (unit.aura && unit.aura.length > 0) {
            const rgb = hexToRgb(unit.color || '#3b82f6');
            const fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${unit.auraOpacity || 0.5})`;

            unit.aura.forEach(relHex => {
                // Rotate relative hex by unit rotation
                const rotHex = hexRotate(relHex, unit.rotation || 0);
                const absHex = hexAdd(unit, rotHex);
                drawHex(absHex, center, { fillStyle });
            });
        }
    });

    // Draw Swordsmen
    state.swordsmen.forEach((unit, index) => {
        drawSwordsman(unit, center, index === state.selectedUnitIndex);
    });

    // Draw Numbers
    state.numbers.forEach(num => {
        drawNumber(num, center);
    });

    // Draw Arrow Start Highlight
    if (state.mode === 'PLACE_ARROW' && state.arrowStart) {
        // Change from fill to stroke only (Line color)
        drawHex(state.arrowStart, center, { fillStyle: 'transparent' });

        // Manual override for highlight border to match request "mark differently... eg change hex line color"
        const { x, y } = hexToPixel(state.arrowStart);
        const pixelX = center.x + x;
        const pixelY = center.y + y;

        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const theta = (state.orientation === 'POINTY' ? 30 : 0) + 60 * i;
            const rad = Math.PI / 180 * theta;
            const px = pixelX + (CONFIG.hexSize - CONFIG.gap / 2) * Math.cos(rad);
            const py = pixelY + (CONFIG.hexSize - CONFIG.gap / 2) * Math.sin(rad);
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.strokeStyle = '#3b82f6'; // Blue Highlight Line
        ctx.lineWidth = 3;
        ctx.stroke();
    }
}

function drawArrow(arrow, center) {
    const fromP = hexToPixel(arrow.from);
    const toP = hexToPixel(arrow.to);

    const startX = center.x + fromP.x;
    const startY = center.y + fromP.y;
    const endX = center.x + toP.x;
    const endY = center.y + toP.y;

    // Calculate angle
    const angle = Math.atan2(endY - startY, endX - startX);
    const dist = Math.sqrt((endX - startX) ** 2 + (endY - startY) ** 2);

    const offset = 8;
    const actualDist = Math.max(0, dist - 2 * offset);

    if (actualDist === 0) return; // Too close

    const headLength = 14;
    const lineEndOffset = offset + headLength;

    const sX = startX + offset * Math.cos(angle);
    const sY = startY + offset * Math.sin(angle);
    const eX_line = endX - lineEndOffset * Math.cos(angle);
    const eY_line = endY - lineEndOffset * Math.sin(angle);
    const eX = endX - offset * Math.cos(angle);
    const eY = endY - offset * Math.sin(angle);

    ctx.save();
    ctx.strokeStyle = arrow.color || '#333';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(sX, sY);
    ctx.lineTo(eX_line, eY_line);
    ctx.stroke();

    // Arrowhead
    ctx.fillStyle = arrow.color || '#333';
    ctx.translate(eX, eY);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(4, 0);
    ctx.lineTo(-16, 12);
    ctx.lineTo(-16, -12);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

function drawNumber(num, center) {
    const { x, y } = hexToPixel(num);
    const pixelX = center.x + x;
    const pixelY = center.y + y;

    ctx.save();
    ctx.font = 'bold 20px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Stroke for visibility against arrows/units
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'white';
    ctx.strokeText(num.value, pixelX, pixelY);

    ctx.fillStyle = 'black';
    ctx.fillText(num.value, pixelX, pixelY);
    ctx.restore();
}

function drawSwordsman(unit, center, isSelected) {
    const { x, y } = hexToPixel(unit);
    const pixelX = center.x + x;
    const pixelY = center.y + y;

    ctx.save();
    ctx.translate(pixelX, pixelY);

    // Selection highlight
    if (isSelected) {
        ctx.beginPath();
        ctx.arc(0, 0, CONFIG.hexSize * 0.8, 0, Math.PI * 2);
        ctx.strokeStyle = '#f59e0b'; // Amber-500
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.fillStyle = 'rgba(245, 158, 11, 0.2)';
        ctx.fill();
    }

    // Orientation logic
    let baseRotation = 0;
    if (state.orientation === 'POINTY') {
        baseRotation = -60 * (Math.PI / 180);
    } else {
        baseRotation = -90 * (Math.PI / 180);
    }

    // Individual unit rotation (60 degree steps)
    const unitRotation = (unit.rotation || 0) * 60 * (Math.PI / 180);

    ctx.rotate(baseRotation + unitRotation);

    // Draw Stylized Swordsman
    ctx.fillStyle = unit.color || '#333';
    ctx.beginPath();
    // Arrow head shape
    ctx.moveTo(10, 0);
    ctx.lineTo(-5, 6);
    ctx.lineTo(-5, -6);
    ctx.closePath();
    ctx.fill();

    // Hilt/Body line?
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-5, 0);
    ctx.lineTo(-12, 0);
    ctx.stroke();

    // Crossguard
    ctx.beginPath();
    ctx.moveTo(-8, -4);
    ctx.lineTo(-8, 4);
    ctx.stroke();

    ctx.restore();
}

function hexToRgb(hex) {
    // Expand shorthand form (e.g. "03F") to full form (e.g. "0033FF")
    var shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    hex = hex.replace(shorthandRegex, function (m, r, g, b) {
        return r + r + g + g + b + b;
    });

    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 59, g: 130, b: 246 };
}

// --- Interaction helpers ---

function pixelToHex(x, y) {
    const size = CONFIG.hexSize;
    let q, r;

    if (state.orientation === 'POINTY') {
        // Pointy To Pixel
        q = (Math.sqrt(3) / 3 * x - 1 / 3 * y) / size;
        r = (2 / 3 * y) / size;
    } else {
        // Flat To Pixel
        q = (2 / 3 * x) / size;
        r = (-1 / 3 * x + Math.sqrt(3) / 3 * y) / size;
    }
    return hexRound({ q, r, s: -q - r });
}

function hexRound(hex) {
    let q = Math.round(hex.q);
    let r = Math.round(hex.r);
    let s = Math.round(hex.s);

    const q_diff = Math.abs(q - hex.q);
    const r_diff = Math.abs(r - hex.r);
    const s_diff = Math.abs(s - hex.s);

    if (q_diff > r_diff && q_diff > s_diff) {
        q = -r - s;
    } else if (r_diff > s_diff) {
        r = -q - s;
    } else {
        s = -q - r;
    }
    return { q, r, s };
}

function updateUI() {
    // Reset all main buttons
    placeMarkerBtn.classList.remove('active');
    placeNumberBtn.classList.remove('active');
    placeArrowBtn.classList.remove('active');
    placeUnitBtn.classList.remove('active');
    gridToolBtn.classList.remove('active');

    // Hide all option panels first
    paintOptions.style.display = 'none';
    numberOptions.style.display = 'none';
    gridOptions.style.display = 'none';

    // Unit actions only show if selected
    if (state.selectedUnitIndex === -1) {
        unitActions.style.display = 'none';
    } else {
        unitActions.style.display = 'flex';
        // If painting, show paint options
        if (state.isPainting) {
            paintOptions.style.display = 'flex';
            paintBtn.classList.add('active');
        } else {
            paintBtn.classList.remove('active');
        }

        if (state.isMoving) {
            moveBtn.classList.add('active');
            canvas.style.cursor = 'crosshair';
        } else {
            moveBtn.classList.remove('active');
            canvas.style.cursor = 'default';
        }

        // Sync Area controls
        const unit = state.swordsmen[state.selectedUnitIndex];
        areaToggle.checked = unit.showArea;
        areaRadiusInput.value = unit.areaRadius || 1;
    }

    // Set active based on mode
    if (state.mode === 'GRID_SETTINGS') {
        gridToolBtn.classList.add('active');
        gridOptions.style.display = 'flex';
    }

    if (state.mode === 'PLACE_MARKER') {
        placeMarkerBtn.classList.add('active');
        paintOptions.style.display = 'flex';
    }

    if (state.mode === 'PLACE_NUMBER') {
        placeNumberBtn.classList.add('active');
        numberOptions.style.display = 'flex';
    }

    if (state.mode === 'PLACE_ARROW') {
        placeArrowBtn.classList.add('active');
        paintOptions.style.display = 'flex';
    }

    if (state.mode === 'PLACE_UNIT') {
        placeUnitBtn.classList.add('active');
    } else {
        canvas.style.cursor = 'default';
    }
}

// --- Init & Events ---

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    state.width = canvas.width;
    state.height = canvas.height;
    render();
}

function toggleOrientation() {
    state.orientation = state.orientation === 'POINTY' ? 'FLAT' : 'POINTY';
    // Update Text
    if (state.orientation === 'POINTY') {
        btnText.textContent = "Switch to Flat Top";

    } else {
        btnText.textContent = "Switch to Pointy Top";

    }
    render();
}

// Event Listeners
window.addEventListener('resize', resize);
toggleBtn.addEventListener('click', toggleOrientation);
ringCountInput.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    CONFIG.mapRadius = val;
    ringCountVal.textContent = val;
    render();
});

placeUnitBtn.addEventListener('click', () => {
    state.mode = state.mode === 'PLACE_UNIT' ? 'VIEW' : 'PLACE_UNIT';
    state.selectedUnitIndex = -1;
    updateUI();
    render();
});

placeMarkerBtn.addEventListener('click', () => {
    state.mode = state.mode === 'PLACE_MARKER' ? 'VIEW' : 'PLACE_MARKER';
    state.selectedUnitIndex = -1;
    updateUI();
    render();
});

placeNumberBtn.addEventListener('click', () => {
    state.mode = state.mode === 'PLACE_NUMBER' ? 'VIEW' : 'PLACE_NUMBER';
    state.selectedUnitIndex = -1;
    updateUI();
    render();
});

placeArrowBtn.addEventListener('click', () => {
    state.mode = state.mode === 'PLACE_ARROW' ? 'VIEW' : 'PLACE_ARROW';
    state.selectedUnitIndex = -1;
    state.arrowStart = null;
    updateUI();
    render();
});

gridToolBtn.addEventListener('click', () => {
    state.mode = state.mode === 'GRID_SETTINGS' ? 'VIEW' : 'GRID_SETTINGS';
    state.selectedUnitIndex = -1;
    updateUI();
    render();
});

canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left - state.width / 2;
    const y = e.clientY - rect.top - state.height / 2;

    const hex = pixelToHex(x, y);

    if (state.mode === 'PLACE_NUMBER') {
        // Stamp logic: get value from input
        const val = numberInput.value;
        const existingIdx = state.numbers.findIndex(n => n.q === hex.q && n.r === hex.r && n.s === hex.s);

        if (existingIdx !== -1) {
            state.numbers.splice(existingIdx, 1);
        }

        if (val && val.trim() !== '') {
            state.numbers.push({ ...hex, value: val });
        }
        render();
        return;
    }

    if (state.mode === 'PLACE_ARROW') {
        if (!state.arrowStart) {
            // First click: Selection
            state.arrowStart = hex;
        } else {
            // Second click: Target
            // Check if same: Cancel
            if (state.arrowStart.q === hex.q && state.arrowStart.r === hex.r) {
                state.arrowStart = null;
            } else {
                // Toggle/Create Arrow
                const existingIdx = state.arrows.findIndex(a =>
                    a.from.q === state.arrowStart.q && a.from.r === state.arrowStart.r &&
                    a.to.q === hex.q && a.to.r === hex.r
                );

                if (existingIdx !== -1) {
                    state.arrows.splice(existingIdx, 1);
                } else {
                    state.arrows.push({
                        from: state.arrowStart,
                        to: hex,
                        color: auraColorInput.value
                    });
                }
                state.arrowStart = null;
            }
        }
        render();
        return;
    }

    if (state.mode === 'PLACE_UNIT') {
        // Add to swordsmen list
        const color = CONFIG.defaultColors[state.nextColorIndex];
        state.nextColorIndex = (state.nextColorIndex + 1) % CONFIG.defaultColors.length;

        state.swordsmen.push({ ...hex, rotation: 0, color: color, auraOpacity: 0.5, showArea: false, areaRadius: 1 });
        render();
    } else if (state.mode === 'PLACE_MARKER') {
        // Toggle Marker
        const existingIndex = state.markers.findIndex(m => m.q === hex.q && m.r === hex.r && m.s === hex.s);
        if (existingIndex !== -1) {
            state.markers.splice(existingIndex, 1);
        } else {
            state.markers.push({
                ...hex,
                color: auraColorInput.value,
                opacity: parseFloat(auraOpacityInput.value)
            });
        }
        render();
    } else if (state.isMoving && state.selectedUnitIndex !== -1) {
        // Attempt to move selected unit
        const selectedUnit = state.swordsmen[state.selectedUnitIndex];
        const dq = Math.abs(selectedUnit.q - hex.q);
        const dr = Math.abs(selectedUnit.r - hex.r);
        const ds = Math.abs(selectedUnit.s - hex.s);

        // If neighbor (distance 1)
        if ((dq + dr + ds) === 2) {
            // Update coordinates but keep rotation
            state.swordsmen[state.selectedUnitIndex].q = hex.q;
            state.swordsmen[state.selectedUnitIndex].r = hex.r;
            state.swordsmen[state.selectedUnitIndex].s = hex.s;
            // Stop moving
            state.isMoving = false;
            updateUI();
            render();
        } else {
            // Clicked elsewhere, maybe deselect or cancel move?
            state.isMoving = false;
            // Check if we clicked another unit
            const index = state.swordsmen.findIndex(u =>
                Math.round(u.q) === hex.q &&
                Math.round(u.r) === hex.r &&
                Math.round(u.s) === hex.s
            );
            if (index !== -1) {
                state.selectedUnitIndex = index;
            }
            updateUI();
            render();
        }
    } else if (state.isPainting && state.selectedUnitIndex !== -1) {
        // Aura Painting Logic
        const unit = state.swordsmen[state.selectedUnitIndex];
        // Calculate relative vector: hex - unit
        const vec = hexSubtract(hex, unit);
        // Inverse rotate (by -rotation or 6-rotation)
        const relHex = hexRotate(vec, 6 - (unit.rotation || 0));

        // Toggle: check if exists in aura
        if (!unit.aura) unit.aura = [];

        const existingIndex = unit.aura.findIndex(h => h.q === relHex.q && h.r === relHex.r && h.s === relHex.s);
        if (existingIndex !== -1) {
            unit.aura.splice(existingIndex, 1);
        } else {
            unit.aura.push(relHex);
        }
        render();

    } else {
        // Selection Logic (View Mode)
        // Find existing unit at this hex
        const index = state.swordsmen.findIndex(u =>
            Math.round(u.q) === hex.q &&
            Math.round(u.r) === hex.r &&
            Math.round(u.s) === hex.s
        );

        if (index !== -1) {
            // Force VIEW mode if we selected a unit (clears Grid Tool etc)
            state.mode = 'VIEW';
        }

        state.selectedUnitIndex = index;
        state.isMoving = false; // Reset move status on new selection
        updateUI();
        render();
    }
});

// Unit Action Listeners
moveBtn.addEventListener('click', () => {
    if (state.selectedUnitIndex !== -1) {
        state.isMoving = !state.isMoving;
        state.isPainting = false; // mutually exclusive
        updateUI();
        render();
    }
});

paintBtn.addEventListener('click', () => {
    if (state.selectedUnitIndex !== -1) {
        state.isPainting = !state.isPainting;
        state.isMoving = false; // mutually exclusive
        updateUI();
        render();
    }
});

rotateCWBtn.addEventListener('click', () => {
    if (state.selectedUnitIndex !== -1) {
        state.swordsmen[state.selectedUnitIndex].rotation = (state.swordsmen[state.selectedUnitIndex].rotation + 1) % 6;
        render();
    }
});

rotateCCWBtn.addEventListener('click', () => {
    if (state.selectedUnitIndex !== -1) {
        let r = state.swordsmen[state.selectedUnitIndex].rotation - 1;
        if (r < 0) r = 5;
        state.swordsmen[state.selectedUnitIndex].rotation = r;
        render();
    }
});

deleteBtn.addEventListener('click', () => {
    if (state.selectedUnitIndex !== -1) {
        state.swordsmen.splice(state.selectedUnitIndex, 1);
        state.selectedUnitIndex = -1;
        updateUI();
        render();
    }
});

closeBtn.addEventListener('click', () => {
    state.selectedUnitIndex = -1;
    updateUI();
    render();
});

auraColorInput.addEventListener('input', (e) => {
    if (state.selectedUnitIndex !== -1) {
        state.swordsmen[state.selectedUnitIndex].color = e.target.value;
        render();
    }
    // If in marker mode
    // (Markers are static once placed, color input only affects new markers)
});

auraOpacityInput.addEventListener('input', (e) => {
    if (state.selectedUnitIndex !== -1) {
        state.swordsmen[state.selectedUnitIndex].auraOpacity = parseFloat(e.target.value);
        render();
    }
});

areaToggle.addEventListener('change', (e) => {
    if (state.selectedUnitIndex !== -1) {
        state.swordsmen[state.selectedUnitIndex].showArea = e.target.checked;
        render();
    }
});

areaRadiusInput.addEventListener('input', (e) => {
    if (state.selectedUnitIndex !== -1) {
        state.swordsmen[state.selectedUnitIndex].areaRadius = parseInt(e.target.value);
        render();
    }
});

// Initial start
resize(); // also triggers render
