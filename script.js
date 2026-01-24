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

// Grid Type
const gridTypeSelect = document.getElementById('grid-type-select');

// Configuration
const CONFIG = {
    hexSize: 30, // Radius of the hex (center to corner) / Half-width for square
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
    gridType: 'HEX', // 'HEX' or 'SQUARE'
    orientation: 'POINTY', // 'POINTY' or 'FLAT' (Only for HEX)
    hoveredHex: null, // Rename to hoveredCell conceptually?
    width: window.innerWidth,
    height: window.innerHeight,
    camera: { x: 0, y: 0, zoom: 1 },
    swordsmen: [], // Unit {q,r,s} or {col,row} + props
    markers: [],
    numbers: [],
    arrows: [],
    mode: 'VIEW', // 'VIEW', 'PLACE_UNIT', 'PLACE_MARKER', 'PLACE_NUMBER', 'PLACE_ARROW', 'GRID_SETTINGS'
    selectedUnitIndex: -1,
    isMoving: false,
    isPainting: false,
    nextColorIndex: 0,
    arrowStart: null
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

function generateSquareGrid(radius) {
    let cells = [];
    // Radius implies N shells. For Square, simple grid from -R to +R
    for (let col = -radius; col <= radius; col++) {
        for (let row = -radius; row <= radius; row++) {
            cells.push({ col, row });
        }
    }
    return cells;
}

function generateSquareRing(center, radius) {
    if (radius === 0) return [center];
    let cells = [];
    // Circle-like Ring using Rounded Euclidean Distance
    // Scan bounding box [-radius, radius]
    for (let c = -radius; c <= radius; c++) {
        for (let r = -radius; r <= radius; r++) {
            const dist = Math.sqrt(c * c + r * r);
            if (Math.round(dist) === radius) {
                cells.push({ col: center.col + c, row: center.row + r });
            }
        }
    }
    return cells;
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

// Square Grid Helpers
function squareToPixel(sq) {
    const size = CONFIG.hexSize * 2; // Cell width = 60
    return {
        x: sq.col * size,
        y: sq.row * size
    };
}

function pixelToSquare(x, y) {
    const size = CONFIG.hexSize * 2;
    const col = Math.round(x / size);
    const row = Math.round(y / size);
    return { col, row };
}

function posToPixel(pos) {
    if (state.gridType === 'HEX') {
        return hexToPixel(pos);
    } else {
        return squareToPixel(pos);
    }
}

function pixelToPos(x, y) {
    if (state.gridType === 'HEX') {
        return pixelToHex(x, y);
    } else {
        return pixelToSquare(x, y);
    }
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

function drawSquare(cell, center, style = {}) {
    const { x, y } = squareToPixel(cell);
    const pixelX = center.x + x;
    const pixelY = center.y + y;
    const size = CONFIG.hexSize * 2; // Full width

    ctx.beginPath();
    ctx.rect(pixelX - size / 2, pixelY - size / 2, size, size);

    if (style.strokeOnly) {
        ctx.strokeStyle = style.strokeStyle || '#333';
        ctx.lineWidth = style.lineWidth || 1;
        ctx.stroke();
        return;
    }

    ctx.fillStyle = (style && style.fillStyle) ? style.fillStyle : CONFIG.colors.fill;
    ctx.fill();

    // Move Target logic (Square)
    let isMoveTarget = false;
    if (state.selectedUnitIndex !== -1 && state.isMoving && state.gridType === 'SQUARE') {
        const selectedUnit = state.swordsmen[state.selectedUnitIndex];
        const dCol = Math.abs(selectedUnit.col - cell.col);
        const dRow = Math.abs(selectedUnit.row - cell.row);
        // 8-way movement (Chebyshev distance = 1)
        if (Math.max(dCol, dRow) === 1) {
            isMoveTarget = true;
        }
    }

    if (isMoveTarget) {
        ctx.strokeStyle = '#10b981';
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
        let ringCells;
        if (state.gridType === 'HEX') {
            ringCells = generateRing(unit, r);
            ringCells.forEach(hex => {
                drawHex(hex, center, {
                    strokeOnly: true,
                    strokeStyle: unit.color || '#333',
                    lineWidth: 2
                });
            });
        } else {
            ringCells = generateSquareRing(unit, r);
            ringCells.forEach(cell => {
                drawSquare(cell, center, {
                    strokeOnly: true,
                    strokeStyle: unit.color || '#333',
                    lineWidth: 2
                });
            });
        }
    }
}

function render() {
    // Clear
    ctx.fillStyle = CONFIG.colors.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const center = { x: canvas.width / 2, y: canvas.height / 2 };

    if (state.gridType === 'HEX') {
        const hexes = generateMap(CONFIG.mapRadius);
        hexes.forEach(hex => {
            drawHex(hex, center);
        });
    } else {
        const cells = generateSquareGrid(CONFIG.mapRadius);
        cells.forEach(cell => {
            drawSquare(cell, center);
        });
    }

    // Draw Area Rings (Under markers/units)
    state.swordsmen.forEach(unit => {
        drawUnitArea(unit, center);
    });

    // Draw Markers
    state.markers.forEach(marker => {
        const { x, y } = posToPixel(marker);
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

            unit.aura.forEach(relPos => {
                let absPos;
                if (state.gridType === 'HEX') {
                    // Rotate relative hex by unit rotation
                    const rotHex = hexRotate(relPos, unit.rotation || 0);
                    absPos = hexAdd(unit, rotHex);
                    drawHex(absPos, center, { fillStyle });
                } else {
                    // Square Rotation: unit.rotation = 0-3 (90 deg steps)
                    // Manual rotation math for (col, row)
                    // 0: (c, r)
                    // 1 (90 deg CW): (-r, c)
                    // 2 (180 deg CW): (-c, -r)
                    // 3 (270 deg CW): (r, -c)

                    let rc = relPos.col;
                    let rr = relPos.row;

                    // Rotate relPos by unit.rotation
                    const rot = (unit.rotation || 0) % 4; // Ensure modulo 4
                    for (let i = 0; i < rot; i++) {
                        const temp = rc;
                        rc = -rr;
                        rr = temp;
                    }

                    const absPos = { col: unit.col + rc, row: unit.row + rr };
                    drawSquare(absPos, center, { fillStyle });
                }
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
        if (state.gridType === 'HEX') {
            drawHex(state.arrowStart, center, { fillStyle: 'transparent' });
            // Manual override for highlight border
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
        } else {
            // Square Highlight
            drawSquare(state.arrowStart, center, { strokeOnly: true, strokeStyle: '#3b82f6', lineWidth: 3 });
        }
    }
}

// Update drawArrow
function drawArrow(arrow, center) {
    const fromP = posToPixel(arrow.from);
    const toP = posToPixel(arrow.to);

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
    const { x, y } = posToPixel(num);
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
    const { x, y } = posToPixel(unit);
    const pixelX = center.x + x;
    const pixelY = center.y + y;

    ctx.save();
    ctx.translate(pixelX, pixelY);

    // Selection highlight
    if (isSelected) {
        ctx.beginPath();
        // Circle or Square highlight based on grid? Let's stick to circle for unit selection, looks better.
        ctx.arc(0, 0, CONFIG.hexSize * 0.8, 0, Math.PI * 2);
        ctx.strokeStyle = '#f59e0b'; // Amber-500
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.fillStyle = 'rgba(245, 158, 11, 0.2)';
        ctx.fill();
    }

    // Orientation logic
    let baseRotation = 0;
    if (state.gridType === 'HEX') {
        if (state.orientation === 'POINTY') {
            baseRotation = -60 * (Math.PI / 180);
        } else {
            baseRotation = -90 * (Math.PI / 180);
        }
    } else {
        // Square: 0 is Right (East). -90 is Up (North).
        // Let's assume default "UP" for 0 rotation?
        // Actually, user said 45 degrees.
        // Let's stick to standard math: 0 = East.
        // If we want swordsman pointing UP by default, rotation should be -90 deg (-PI/2).
        baseRotation = -90 * (Math.PI / 180);
    }

    // Individual unit rotation
    // HEX: 60 deg steps. SQUARE: 90 deg steps.
    const stepSize = state.gridType === 'HEX' ? 60 : 90;
    const unitRotation = (unit.rotation || 0) * stepSize * (Math.PI / 180);

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

const isSamePos = (a, b) => {
    if (state.gridType === 'HEX') {
        return Math.round(a.q) === Math.round(b.q) && Math.round(a.r) === Math.round(b.r) && Math.round(a.s) === Math.round(b.s);
    } else {
        return a.col === b.col && a.row === b.row;
    }
}

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

function switchGridType(newType) {
    if (state.gridType === newType) return;

    // Destructive action: Clear ALL entities
    state.gridType = newType;
    state.swordsmen = [];
    state.markers = [];
    state.numbers = [];
    state.arrows = [];
    state.selectedUnitIndex = -1;
    state.arrowStart = null;
    state.isPainting = false;
    state.isMoving = false;
    state.mode = 'VIEW';

    // UI Updates
    if (newType === 'SQUARE') {
        toggleBtn.style.display = 'none'; // No Pointy/Flat for Square
    } else {
        toggleBtn.style.display = 'block';
    }

    updateUI();
    render();
}

// Event Listeners
window.addEventListener('resize', resize);
gridTypeSelect.addEventListener('change', (e) => {
    switchGridType(e.target.value.toUpperCase());
});
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

    const pos = pixelToPos(x, y);

    // Helper to check equality based on grid type
    const isSamePos = (a, b) => {
        if (state.gridType === 'HEX') {
            return Math.round(a.q) === Math.round(b.q) && Math.round(a.r) === Math.round(b.r) && Math.round(a.s) === Math.round(b.s);
        } else {
            return a.col === b.col && a.row === b.row;
        }
    };

    if (state.mode === 'PLACE_NUMBER') {
        const val = numberInput.value;
        const existingIdx = state.numbers.findIndex(n => isSamePos(n, pos));

        if (existingIdx !== -1) {
            state.numbers.splice(existingIdx, 1);
        }

        if (val && val.trim() !== '') {
            state.numbers.push({ ...pos, value: val });
        }
        render();
        return;
    }

    if (state.mode === 'PLACE_ARROW') {
        if (!state.arrowStart) {
            // First click: Selection
            state.arrowStart = pos;
        } else {
            // Second click: Target
            // Check if same: Cancel
            if (isSamePos(state.arrowStart, pos)) {
                state.arrowStart = null;
            } else {
                // Toggle/Create Arrow
                const existingIdx = state.arrows.findIndex(a =>
                    isSamePos(a.from, state.arrowStart) && isSamePos(a.to, pos)
                );

                if (existingIdx !== -1) {
                    state.arrows.splice(existingIdx, 1);
                } else {
                    state.arrows.push({
                        from: state.arrowStart,
                        to: pos,
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

        state.swordsmen.push({ ...pos, rotation: 0, color: color, auraOpacity: 0.5, showArea: false, areaRadius: 1 });
        render();
    } else if (state.mode === 'PLACE_MARKER') {
        // Toggle Marker
        const existingIndex = state.markers.findIndex(m => isSamePos(m, pos));
        if (existingIndex !== -1) {
            state.markers.splice(existingIndex, 1);
        } else {
            state.markers.push({
                ...pos,
                color: auraColorInput.value,
                opacity: parseFloat(auraOpacityInput.value)
            });
        }
        render();
    } else if (state.isMoving && state.selectedUnitIndex !== -1) {
        // Attempt to move selected unit
        const selectedUnit = state.swordsmen[state.selectedUnitIndex];
        let isValidMove = false;

        if (state.gridType === 'HEX') {
            const dq = Math.abs(selectedUnit.q - pos.q);
            const dr = Math.abs(selectedUnit.r - pos.r);
            const ds = Math.abs(selectedUnit.s - pos.s);
            if ((dq + dr + ds) === 2) isValidMove = true;
        } else {
            // Square: 8-way movement
            const dCol = Math.abs(selectedUnit.col - pos.col);
            const dRow = Math.abs(selectedUnit.row - pos.row);
            if (Math.max(dCol, dRow) === 1) isValidMove = true;
        }

        // If neighbor
        if (isValidMove) {
            // Update coordinates but keep rotation
            if (state.gridType === 'HEX') {
                state.swordsmen[state.selectedUnitIndex].q = pos.q;
                state.swordsmen[state.selectedUnitIndex].r = pos.r;
                state.swordsmen[state.selectedUnitIndex].s = pos.s;
            } else {
                state.swordsmen[state.selectedUnitIndex].col = pos.col;
                state.swordsmen[state.selectedUnitIndex].row = pos.row;
            }
            // Stop moving
            state.isMoving = false;
            updateUI();
            render();
        } else {
            // Clicked elsewhere
            state.isMoving = false;
            // Check if we clicked another unit
            const index = state.swordsmen.findIndex(u => isSamePos(u, pos));
            if (index !== -1) {
                state.selectedUnitIndex = index;
            }
            updateUI();
            render();
        }
    } else if (state.isPainting && state.selectedUnitIndex !== -1) {
        // Aura Painting Logic
        const unit = state.swordsmen[state.selectedUnitIndex];
        let relPos;

        if (state.gridType === 'HEX') {
            const vec = hexSubtract(pos, unit);
            relPos = hexRotate(vec, 6 - (unit.rotation || 0));
        } else {
            // Square relative: Target - Unit
            let rc = pos.col - unit.col;
            let rr = pos.row - unit.row;

            // Inverse Rotate Square (Rotate counter-rotation times)
            // If unit is rotated R times CW:
            // Rel = (Target - Unit) rotated -R times (or +R times CCW, or 4-R times CW).
            const rot = (4 - ((unit.rotation || 0) % 4)) % 4;

            for (let i = 0; i < rot; i++) {
                const temp = rc;
                rc = -rr;
                rr = temp;
            }
            relPos = { col: rc, row: rr };
        }

        // Toggle: check if exists in aura
        if (!unit.aura) unit.aura = [];

        const existingIndex = unit.aura.findIndex(h => isSamePos(h, relPos));

        if (existingIndex !== -1) {
            unit.aura.splice(existingIndex, 1);
        } else {
            unit.aura.push(relPos);
        }
        render();

    } else {
        // Selection Logic (View Mode)
        // Find existing unit at this hex
        const index = state.swordsmen.findIndex(u => isSamePos(u, pos));

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
        const stepCount = state.gridType === 'HEX' ? 6 : 4;
        state.swordsmen[state.selectedUnitIndex].rotation = (state.swordsmen[state.selectedUnitIndex].rotation + 1) % stepCount;
        render();
    }
});

rotateCCWBtn.addEventListener('click', () => {
    if (state.selectedUnitIndex !== -1) {
        const stepCount = state.gridType === 'HEX' ? 6 : 4;
        let r = state.swordsmen[state.selectedUnitIndex].rotation - 1;
        if (r < 0) r = stepCount - 1;
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
