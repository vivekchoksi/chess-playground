const chess = new Chess();
const boardEl = document.getElementById('board');
const statusEl = document.getElementById('status');
const historyEl = document.getElementById('history');
const resetBtn = document.getElementById('resetBtn');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const promotionModal = document.getElementById('promotion-modal');
const promotionPieces = document.querySelectorAll('.promotion-pieces img');
const difficultySlider = document.getElementById('difficultySlider');
const diffLabels = document.querySelectorAll('.slider-labels span');

let selectedSquare = null;
let possibleMoves = [];
let redoStack = [];
let pendingMove = null;
let engineDepth = 10;

// Update difficulty based on slider
const depthMap = {
    '1': 1,   // Beginner
    '2': 4,   // Intermediate
    '3': 8,   // Advanced
    '4': 14   // Grandmaster
};

difficultySlider.addEventListener('input', (e) => {
    const val = e.target.value;
    engineDepth = depthMap[val] || 10;

    // Update labels styling
    diffLabels.forEach((label, idx) => {
        if (idx === 0) {
            label.className = val === '1' ? 'diff-active' : '';
        } else if (idx === 1) {
            if (val === '2' || val === '3') {
                label.className = 'diff-active';
                label.innerHTML = val === '2' ? 'Intermediate<br>~1000 ELO' : 'Advanced<br>~1500 ELO';
            } else {
                label.className = '';
            }
        } else if (idx === 2) {
            label.className = val === '4' ? 'diff-active' : '';
        }
    });
});

promotionPieces.forEach(img => {
    img.addEventListener('click', () => {
        if (pendingMove) {
            finishMove(pendingMove.from, pendingMove.to, img.dataset.piece);
            pendingMove = null;
            promotionModal.classList.add('hidden');
        }
    });
});

// Audio Context Setup
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new AudioContext();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

function playSound(isCapture) {
    initAudio();
    if (!audioCtx) return;

    // Safety check - avoid playing too many sounds at once
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    if (isCapture) {
        // Deeper thump for capture
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(150, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(30, audioCtx.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0.8, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        osc.start(audioCtx.currentTime);
        osc.stop(audioCtx.currentTime + 0.1);
    } else {
        // Clean wooden knock for normal move
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.05);
        gainNode.gain.setValueAtTime(0.6, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.05);
        osc.start(audioCtx.currentTime);
        osc.stop(audioCtx.currentTime + 0.05);
    }
}

// User interaction initializes audio context
document.addEventListener('click', () => { if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume(); }, { once: true });
document.addEventListener('mousedown', () => { if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume(); }, { once: true });

// Stockfish Engine Setup
const stockfishUrl = 'https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js';
const workerBlob = new Blob([`importScripts('${stockfishUrl}');`], { type: 'application/javascript' });
const engine = new Worker(URL.createObjectURL(workerBlob));

engine.postMessage('uci');
engine.postMessage('isready');

engine.onmessage = function (event) {
    const line = event.data;
    if (line.match(/^bestmove/)) {
        const move = line.split(' ')[1];
        if (move) {
            handleComputerMove(move);
        }
    }
};

const pieceImages = {
    'p': 'https://upload.wikimedia.org/wikipedia/commons/c/c7/Chess_pdt45.svg',
    'n': 'https://upload.wikimedia.org/wikipedia/commons/e/ef/Chess_ndt45.svg',
    'b': 'https://upload.wikimedia.org/wikipedia/commons/9/98/Chess_bdt45.svg',
    'r': 'https://upload.wikimedia.org/wikipedia/commons/f/ff/Chess_rdt45.svg',
    'q': 'https://upload.wikimedia.org/wikipedia/commons/4/47/Chess_qdt45.svg',
    'k': 'https://upload.wikimedia.org/wikipedia/commons/f/f0/Chess_kdt45.svg',
    'P': 'https://upload.wikimedia.org/wikipedia/commons/4/45/Chess_plt45.svg',
    'N': 'https://upload.wikimedia.org/wikipedia/commons/7/70/Chess_nlt45.svg',
    'B': 'https://upload.wikimedia.org/wikipedia/commons/b/b1/Chess_blt45.svg',
    'R': 'https://upload.wikimedia.org/wikipedia/commons/7/72/Chess_rlt45.svg',
    'Q': 'https://upload.wikimedia.org/wikipedia/commons/1/15/Chess_qlt45.svg',
    'K': 'https://upload.wikimedia.org/wikipedia/commons/4/42/Chess_klt45.svg'
};

function initBoard() {
    renderBoard();
    updateStatus();
    updateHistory();
}

function getSquareId(i, j) {
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    return files[j] + (8 - i);
}

function renderBoard() {
    boardEl.innerHTML = '';
    const board = chess.board();

    for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++) {
            const squareId = getSquareId(i, j);
            const squareEl = document.createElement('div');
            const isLight = (i + j) % 2 === 0;
            squareEl.className = `square ${isLight ? 'light' : 'dark'}`;
            squareEl.dataset.square = squareId;

            if (j === 0) {
                const rankEl = document.createElement('span');
                rankEl.className = 'coordinate-rank';
                rankEl.textContent = 8 - i;
                squareEl.appendChild(rankEl);
            }
            if (i === 7) {
                const fileEl = document.createElement('span');
                fileEl.className = 'coordinate-file';
                const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
                fileEl.textContent = files[j];
                squareEl.appendChild(fileEl);
            }

            if (board[i][j]) {
                const piece = board[i][j];
                const pieceCode = piece.color === 'w' ? piece.type.toUpperCase() : piece.type.toLowerCase();
                const img = document.createElement('img');
                img.src = pieceImages[pieceCode];
                img.className = 'piece';

                // Enable drag and drop for player's pieces (White)
                img.draggable = piece.color === 'w';

                img.addEventListener('dragstart', (e) => {
                    if (chess.turn() !== 'w' || piece.color !== 'w' || chess.game_over()) {
                        e.preventDefault();
                        return;
                    }
                    e.dataTransfer.setData('text/plain', squareId);
                    e.dataTransfer.effectAllowed = 'move';

                    selectedSquare = squareId;
                    possibleMoves = chess.moves({ square: squareId, verbose: true });
                    updateHighlights();
                });

                img.addEventListener('dragend', () => {
                    document.querySelectorAll('.square').forEach(sq => sq.classList.remove('drag-target'));
                });

                squareEl.appendChild(img);
            }

            // Drag and Drop targets
            squareEl.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (possibleMoves.some(m => m.to === squareId)) {
                    squareEl.classList.add('drag-target');
                }
            });

            squareEl.addEventListener('dragleave', (e) => {
                squareEl.classList.remove('drag-target');
            });

            squareEl.addEventListener('drop', (e) => {
                e.preventDefault();
                squareEl.classList.remove('drag-target');
                const fromSquare = e.dataTransfer.getData('text/plain');
                if (fromSquare && fromSquare !== squareId) {
                    handleDragDrop(fromSquare, squareId);
                }
            });

            squareEl.addEventListener('click', () => handleSquareClick(squareId));
            boardEl.appendChild(squareEl);
        }
    }
    updateHighlights();
}

function updateHighlights() {
    const history = chess.history({ verbose: true });
    const lastMove = history.length > 0 ? history[history.length - 1] : null;

    let checkSquareId = null;
    if (chess.in_check()) {
        const board = chess.board();
        for (let i = 0; i < 8; i++) {
            for (let j = 0; j < 8; j++) {
                if (board[i][j] && board[i][j].type === 'k' && board[i][j].color === chess.turn()) {
                    checkSquareId = getSquareId(i, j);
                }
            }
        }
    }

    document.querySelectorAll('.square').forEach(sqEl => {
        sqEl.classList.remove('selected', 'hint', 'hint-capture', 'last-move', 'in-check', 'drag-target');
        const sqId = sqEl.dataset.square;

        if (selectedSquare === sqId) {
            sqEl.classList.add('selected');
        }

        const moveInfo = possibleMoves.find(m => m.to === sqId);
        if (moveInfo) {
            if (moveInfo.flags.includes('c') || moveInfo.flags.includes('e')) {
                sqEl.classList.add('hint-capture');
            } else {
                sqEl.classList.add('hint');
            }
        }

        if (lastMove && (lastMove.from === sqId || lastMove.to === sqId)) {
            sqEl.classList.add('last-move');
        }

        if (checkSquareId === sqId) {
            sqEl.classList.add('in-check');
        }
    });
}

function handleSquareClick(squareId) {
    if (chess.game_over() || chess.turn() !== 'w') return;

    if (selectedSquare) {
        const moveInfo = possibleMoves.find(m => m.to === squareId);
        if (moveInfo) {
            handleMove(selectedSquare, squareId);
            return;
        }
    }

    const piece = chess.get(squareId);
    if (piece && piece.color === 'w') {
        selectedSquare = squareId;
        possibleMoves = chess.moves({ square: squareId, verbose: true });
    } else {
        selectedSquare = null;
        possibleMoves = [];
    }
    updateHighlights();
}

function handleDragDrop(fromId, toId) {
    if (chess.game_over() || chess.turn() !== 'w') return;
    const moveInfo = possibleMoves.find(m => m.to === toId);
    if (moveInfo) {
        handleMove(fromId, toId);
    } else {
        selectedSquare = null;
        possibleMoves = [];
        updateHighlights();
    }
}

function handleMove(from, to) {
    const isPromotion = possibleMoves.some(m => m.from === from && m.to === to && m.flags.includes('p'));
    if (isPromotion) {
        pendingMove = { from, to };
        promotionModal.classList.remove('hidden');
    } else {
        finishMove(from, to);
    }
}

function finishMove(from, to, promotion) {
    chess.move({ from, to, promotion });

    const history = chess.history({ verbose: true });
    const lastMove = history[history.length - 1];
    playSound(lastMove.flags.includes('c') || lastMove.flags.includes('e'));

    selectedSquare = null;
    possibleMoves = [];
    redoStack = []; // Reset redo stack when a new move is made

    renderBoard();
    updateStatus();
    updateHistory();

    if (!chess.game_over() && chess.turn() === 'b') {
        statusEl.textContent = 'Stockfish is thinking...';
        setTimeout(makeComputerMove, 300);
    }
}

function makeComputerMove() {
    if (chess.game_over() || chess.turn() !== 'b') return;

    // Use dynamically configured engine depth
    engine.postMessage(`position fen ${chess.fen()}`);
    engine.postMessage(`go depth ${engineDepth}`);
}

function handleComputerMove(uciMove) {
    const from = uciMove.substring(0, 2);
    const to = uciMove.substring(2, 4);
    const promotion = uciMove.length === 5 ? uciMove.substring(4, 5) : undefined;

    // Make move
    chess.move({ from, to, promotion });

    const history = chess.history({ verbose: true });
    const lastMove = history[history.length - 1];
    playSound(lastMove.flags.includes('c') || lastMove.flags.includes('e'));

    renderBoard();
    updateStatus();
    updateHistory();
}

function updateStatus() {
    let statusHTML = '';

    if (chess.in_checkmate()) {
        const winner = chess.turn() === 'w' ? 'Black' : 'White';
        statusHTML = `Game over! ${winner} wins by checkmate.`;
    } else if (chess.in_draw()) {
        statusHTML = 'Game over! Draw.';
    } else if (chess.in_stalemate()) {
        statusHTML = 'Game over! Stalemate.';
    } else {
        const moveColor = chess.turn() === 'w' ? 'Your' : "Stockfish's";
        statusHTML = `${moveColor} turn`;
        if (chess.in_check()) {
            statusHTML += ' <span style="color:#f85149;">(In Check!)</span>';
        }
    }

    statusEl.innerHTML = statusHTML;
}

function updateHistory() {
    let html = '';
    const history = chess.history();
    for (let i = 0; i < history.length; i += 2) {
        const moveNumber = Math.floor(i / 2) + 1;
        const whiteMove = history[i];
        const blackMove = history[i + 1] ? history[i + 1] : '';
        html += `<li><span class="move-num">${moveNumber}.</span> <span class="move">${whiteMove}</span> <span class="move">${blackMove}</span></li>`;
    }
    historyEl.innerHTML = html;
    historyEl.scrollTop = historyEl.scrollHeight;
}

// Controls Logic
resetBtn.addEventListener('click', () => {
    chess.reset();
    selectedSquare = null;
    possibleMoves = [];
    redoStack = [];
    renderBoard();
    updateStatus();
    updateHistory();
});

prevBtn.addEventListener('click', () => {
    if (chess.history().length > 0) {
        let lastMove = chess.undo();
        redoStack.push(lastMove);

        // If we just undid the bot's (black) move, also undo the player's (white) move
        // so it actually becomes the player's turn to play a different move.
        if (lastMove.color === 'b' && chess.history().length > 0) {
            let prevMove = chess.undo();
            redoStack.push(prevMove);
        }

        selectedSquare = null;
        possibleMoves = [];
        renderBoard();
        updateStatus();
        updateHistory();
    }
});

nextBtn.addEventListener('click', () => {
    if (redoStack.length > 0) {
        // Redo stack behaves as LIFO containing chess moves
        let nextMove = redoStack.pop();
        chess.move(nextMove);

        selectedSquare = null;
        possibleMoves = [];
        renderBoard();
        updateStatus();
        updateHistory();

        // If redoing brings us back to the present, and it's stockfish's turn, resume analysis
        if (redoStack.length === 0 && chess.turn() === 'b' && !chess.game_over()) {
            statusEl.textContent = 'Stockfish is thinking...';
            setTimeout(makeComputerMove, 300);
        }
    }
});

initBoard();
