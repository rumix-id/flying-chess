// content.js

let engineWorker = null;
let boardMonitorInterval = null;
let currentDepth = 15; 
let isMovingPiece = false; 
let lastExecutedMove = ""; 
let latestBestMove = null; 
let availableComments = []; 

// === BAGIAN 1: LOGIKA CHESS ENGINE & AUTO PILOT ===

function getFenString(chessboard) {
    let fen_string = "";
    for (let i = 8; i >= 1; i--) {
        for (let j = 1; j <= 8; j++) {
            let position = `${j}${i}`;
            if (j === 1 && i !== 8) { fen_string += "/"; }
            
            let pieceNodeList = document.querySelectorAll(`.piece.square-${position}`);
            let piece_in_position = null;
            
            if (pieceNodeList.length > 0) {
                let classes = pieceNodeList[0].classList;
                for (let item of classes.values()) {
                    if (item.length === 2) { piece_in_position = item; }
                }
            }

            if (piece_in_position === null) {
                let previous_char = fen_string.slice(-1);
                if (!isNaN(Number(previous_char))) {
                    fen_string = fen_string.substring(0, fen_string.length - 1);
                    fen_string += Number(previous_char) + 1;
                } else {
                    fen_string += "1";
                }
            } else if (piece_in_position[0] === "b") {
                fen_string += piece_in_position[1];
            } else if (piece_in_position[0] === "w") {
                fen_string += piece_in_position[1].toUpperCase();
            }
        }
    }
    
    // PERBAIKAN FEN MINIMALIS: Kita menambahkan ' - - 0 1' di belakang 
    // agar format FEN lebih sah di mata protokol UCI, meski tanpa hak rokade yang sempurna.
    return fen_string; 
}

async function simulateClickMove(startPos, endPos, isFlipped) {
    const board = document.querySelector("wc-chess-board");
    if (!board) return;
    
    const rect = board.getBoundingClientRect();
    const sqSize = rect.width / 8;
    
    function getCoords(posStr) {
        const files = ['a','b','c','d','e','f','g','h'];
        const file = files.indexOf(posStr[0]);
        const rank = parseInt(posStr[1]) - 1;

        let col = file;
        let row = 7 - rank;
        if (isFlipped) { col = 7 - file; row = rank; }
        
        return {
            x: rect.left + (col * sqSize) + (sqSize / 2),
            y: rect.top + (row * sqSize) + (sqSize / 2)
        };
    }

    const start = getCoords(startPos);
    const end = getCoords(endPos);

    const clickSquare = async (x, y) => {
        const targetElement = document.elementFromPoint(x, y) || board;
        targetElement.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', isPrimary: true, buttons: 1 }));
        targetElement.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: x, clientY: y, buttons: 1 }));
        await new Promise(r => setTimeout(r, 40)); 
        targetElement.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', isPrimary: true, buttons: 0 }));
        targetElement.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: x, clientY: y, buttons: 0 }));
        targetElement.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y, buttons: 0 }));
    };

    await clickSquare(start.x, start.y);
    await new Promise(r => setTimeout(r, 150)); 
    await clickSquare(end.x, end.y);
}

async function triggerAutoComment() {
    if (availableComments.length === 0) return;

    await new Promise(r => setTimeout(r, 600)); 

    const tabs = Array.from(document.querySelectorAll('[role="tab"], .board-tab-item, .nav-item'));
    const chatTab = tabs.find(t => t.innerText && /obrolan|chat/i.test(t.innerText));

    if (chatTab) {
        chatTab.click();
        await new Promise(r => setTimeout(r, 800)); 

        const chatInput = document.querySelector('input[placeholder*="pesan" i], input[placeholder*="message" i], input[name="message"]');
        
        if (chatInput && !chatInput.disabled) {
            const randomIndex = Math.floor(Math.random() * availableComments.length);
            const textToSend = availableComments[randomIndex];
            
            availableComments.splice(randomIndex, 1);
            
            chatInput.focus();
            chatInput.value = ""; 
            
            for (let i = 0; i < textToSend.length; i++) {
                chatInput.value += textToSend[i];
                chatInput.dispatchEvent(new Event('input', { bubbles: true }));
                await new Promise(r => setTimeout(r, Math.floor(Math.random() * 50) + 50));
            }

            await new Promise(r => setTimeout(r, 500)); 
            
            chatInput.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', keyCode: 13 }));
            chatInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', keyCode: 13 }));
            
            console.log("Auto Comment terkirim:", textToSend);
            
            await new Promise(r => setTimeout(r, 3000)); 
        }
    }
    
    const currentTabs = document.querySelectorAll('[role="tab"], .board-tab-item, .nav-item');
    for (let tab of currentTabs) {
        if (tab.innerText && /langkah|moves/i.test(tab.innerText)) {
            tab.click();
            break;
        }
    }
}

function parseDelay(delayStr) {
    if (!delayStr || typeof delayStr !== 'string') return 1500;
    
    try {
        if (delayStr.includes(',')) {
            const delays = delayStr.split(',')
                                   .map(d => parseInt(d.trim(), 10))
                                   .filter(d => !isNaN(d) && d > 0); 
            
            if (delays.length > 0) {
                const randomIndex = Math.floor(Math.random() * delays.length);
                return delays[randomIndex];
            }
        }
        
        if (delayStr.includes('-')) {
            const parts = delayStr.split('-');
            const min = parseInt(parts[0].trim(), 10);
            const max = parseInt(parts[1].trim(), 10);
            if (!isNaN(min) && !isNaN(max) && max >= min) {
                return Math.floor(Math.random() * (max - min + 1)) + min;
            }
        }
        
        const val = parseInt(delayStr.trim(), 10);
        if (!isNaN(val)) return val;
    } catch (e) {
        console.error("Kesalahan membaca delay:", e);
    }
    return 1500;
}

function startFlyingChess(mode, depthValue, commentsText, delayText) {
    const chessboard = document.querySelector("wc-chess-board");
    if (!chessboard) {
        alert("Papan catur tidak ditemukan!");
        return false;
    }

    currentDepth = parseInt(depthValue, 10);
    if (isNaN(currentDepth) || currentDepth < 1) {
        currentDepth = 15; 
    }
    console.log("Engine dimulai dengan Depth MURNI:", currentDepth);

    let isFlipped = chessboard.classList.contains("flipped");
    let player_colour = isFlipped ? "b" : "w";
    
    // PERBAIKAN FEN PROTOKOL UCI
    let current_fen = getFenString(chessboard) + ` ${player_colour} - - 0 1`;
    
    if (commentsText && commentsText.trim() !== "") {
        availableComments = commentsText.split(',').map(c => c.trim()).filter(c => c.length > 0);
    } else {
        availableComments = [];
    }

    lastExecutedMove = ""; 
    latestBestMove = null; 
    isMovingPiece = false;

    try {
        engineWorker = new Worker("/bundles/app/js/vendor/jschessengine/stockfish.asm.1abfa10c.js");
    } catch (e) {
        alert("Gagal memuat Stockfish worker.");
        return false;
    }

    // PERBAIKAN: Hanya mengirim 1 perintah 'go depth' agar bot bisa berpikir tenang
    engineWorker.postMessage(`position fen ${current_fen}`);
    engineWorker.postMessage(`go depth ${currentDepth}`);

    boardMonitorInterval = setInterval(async () => {
        let new_fen = getFenString(chessboard) + ` ${player_colour} - - 0 1`;
        
        if (new_fen !== current_fen) {
            current_fen = new_fen;
            lastExecutedMove = ""; 
            latestBestMove = null; 
            
            // PERBAIKAN: Sama seperti di atas
            engineWorker.postMessage(`position fen ${current_fen}`);
            engineWorker.postMessage(`go depth ${currentDepth}`);
        }

        if (mode === "autopilot" && !isMovingPiece && latestBestMove && latestBestMove !== "(none)" && latestBestMove !== lastExecutedMove) {
            isMovingPiece = true; 
            
            try {
                let moveToExecute = latestBestMove; 
                
                let calculatedDelay = parseDelay(delayText);
                console.log("Menunggu:", calculatedDelay, "ms");
                await new Promise(r => setTimeout(r, calculatedDelay));

                const startSq = moveToExecute.substring(0, 2);
                const endSq = moveToExecute.substring(2, 4);
                
                await simulateClickMove(startSq, endSq, isFlipped);
                lastExecutedMove = moveToExecute; 

                if (availableComments.length > 0) {
                    if (Math.random() < 0.25) {
                        await triggerAutoComment();
                    }
                }
            } catch (error) {
                console.error("Terjadi kesalahan:", error);
            } finally {
                isMovingPiece = false; 
            }
        }
    }, 500);

    engineWorker.onmessage = function(event) {
        if (event.data.startsWith('bestmove')) {
            const bestMove = event.data.split(' ')[1];
            
            if (!bestMove || bestMove === "(none)") return;
            
            latestBestMove = bestMove; 
            drawCheatSquares(bestMove, chessboard);
        }
    };
    return true;
}

function stopFlyingChess() {
    if (boardMonitorInterval) clearInterval(boardMonitorInterval);
    if (engineWorker) {
        engineWorker.terminate();
        engineWorker = null;
    }
    document.querySelectorAll(".cheat-highlight").forEach(el => el.remove());
    isMovingPiece = false;
    availableComments = []; 
}

function drawCheatSquares(bestMove, chessboard) {
    const char_map = { "a": 1, "b": 2, "c": 3, "d": 4, "e": 5, "f": 6, "g": 7, "h": 8 };
    document.querySelectorAll(".cheat-highlight").forEach(el => el.remove());

    const bestMove_array = bestMove.split("");
    const initial_position = `${char_map[bestMove_array[0]]}${bestMove_array[1]}`;
    const final_position = `${char_map[bestMove_array[2]]}${bestMove_array[3]}`;

    const createHighlight = (pos) => {
        let highlight = document.createElement("div");
        highlight.className = `highlight cheat-highlight square-${pos}`;
        highlight.style = "background:red; opacity:0.6; z-index: 100; pointer-events: none;";
        return highlight;
    };

    chessboard.appendChild(createHighlight(initial_position));
    chessboard.appendChild(createHighlight(final_position));
}


// === BAGIAN 2: LOGIKA UI (SHADOW DOM) ===

function createFloatingMenu() {
    const container = document.createElement('div');
    container.id = 'flying-chess-container';
    const shadow = container.attachShadow({ mode: 'open' });
    
    const style = document.createElement('style');
    style.textContent = `
        .menu-wrapper {
            position: fixed; top: 20px; right: 20px; width: 250px;
            background: #2b2b2b; color: #ffffff; border: 2px solid #4CAF50;
            border-radius: 8px; padding: 15px; font-family: Arial, sans-serif;
            z-index: 999999; box-shadow: 0 4px 8px rgba(0,0,0,0.5);
        }
        h3 { margin: 0 0 15px 0; text-align: center; color: #4CAF50; }
        .form-group { margin-bottom: 15px; }
        label { display: block; font-size: 12px; margin-bottom: 5px; }
        select, input[type="text"], input[type="number"] {
            width: 100%; padding: 8px; box-sizing: border-box;
            background: #1e1e1e; color: white; border: 1px solid #555; border-radius: 4px;
            transition: opacity 0.3s ease;
        }
        select:disabled, input[type="text"]:disabled, input[type="number"]:disabled {
            opacity: 0.4; cursor: not-allowed; background: #111;
        }
        button {
            width: 100%; padding: 10px; background: #4CAF50; color: white;
            border: none; border-radius: 4px; cursor: pointer; font-weight: bold;
        }
        button:hover { background: #45a049; }
        button:disabled { background: #555; cursor: not-allowed; }
        .btn-danger { background: #f44336; }
        .btn-danger:hover { background: #d32f2f; }
    `;

    const menuHTML = `
        <div class="menu-wrapper">
            <h3>Flying Chess</h3>
            <div class="form-group">
                <label>Selection Mode:</label>
                <select id="mode-select">
                    <option value="suggestion">1. Auto Suggestion</option>
                    <option value="autopilot">2. Auto Pilot + Auto Comment</option>
                </select>
            </div>
            <div class="form-group">
                <label>Depth of Thinking (recommended: 15):</label>
                <input type="number" id="depth-input" value="15" min="1" max="30" />
            </div>
            <div class="form-group">
                <label>Random Comments (leave blank is fine):</label>
                <input type="text" id="comment-input" value="you are great, good move, interesting" />
            </div>
            <div class="form-group">
                <label>Turn time (example: 1000 = 1 second):</label>
                <input type="text" id="delay-input" value="2000,3000,8000,5000,12000" disabled />
            </div>
            <button id="action-btn">Start Flight</button>
        </div>
    `;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = menuHTML;
    shadow.appendChild(style);
    shadow.appendChild(wrapper);
    document.body.appendChild(container);

    setupMenuLogic(shadow);
}

function setupMenuLogic(shadow) {
    const actionBtn = shadow.getElementById('action-btn');
    const modeSelect = shadow.getElementById('mode-select');
    const depthInput = shadow.getElementById('depth-input'); 
    const commentInput = shadow.getElementById('comment-input');
    const delayInput = shadow.getElementById('delay-input');
    
    let isRunning = false;

    modeSelect.addEventListener('change', (e) => {
        if (!isRunning) {
            delayInput.disabled = (e.target.value === 'suggestion');
        }
    });

    actionBtn.addEventListener('click', () => {
        if (!isRunning) {
            const isStarted = startFlyingChess(modeSelect.value, depthInput.value, commentInput.value, delayInput.value);
            if (isStarted) {
                isRunning = true;
                modeSelect.disabled = true;
                depthInput.disabled = true; 
                commentInput.disabled = true;
                delayInput.disabled = true;
                actionBtn.textContent = "Stop Flight";
                actionBtn.classList.add('btn-danger');
            }
        } else {
            stopFlyingChess();
            isRunning = false;
            modeSelect.disabled = false;
            depthInput.disabled = false; 
            commentInput.disabled = false;
            delayInput.disabled = (modeSelect.value === 'suggestion'); 
            actionBtn.textContent = "Simpan & Jalankan";
            actionBtn.classList.remove('btn-danger');
        }
    });
}

createFloatingMenu();