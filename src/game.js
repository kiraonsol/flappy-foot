// Game configuration and globals
let walletConnection = null;
let playerWallet = null;
let gameInstance = null;
let hasSeasonPass = false; // Track if player paid for this season

// Solana connection
const connection = new solanaWeb3.Connection('https://api.devnet.solana.com');
const TREASURY_PUBKEY = new solanaWeb3.PublicKey('9euu6jdRP2Uhi3qYihptK3aVLx8Gj1w6R3ALhLjr8XDN');

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyAR7h4noqcKozvPq5th6YHolF42Jc7O1CA",
    authDomain: "flappy-foot.firebaseapp.com",
    databaseURL: "https://flappy-foot-default-rtdb.firebaseio.com",
    projectId: "flappy-foot",
    storageBucket: "flappy-foot.firebasestorage.app",
    messagingSenderId: "498047643029",
    appId: "1:498047643029:web:7f59492defbc39e6659a9c",
    measurementId: "G-XEHWMTRVXN"
};
// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// GameStats class for local storage management
class GameStats {
  constructor() {
    this.currentScore = 0;
    this.bestScore = parseInt(localStorage.getItem('flappyBestScore') || '0');
    this.recentScore = 0;
    this.totalGames = parseInt(localStorage.getItem('flappyTotalGames') || '0');
    this.gameHistory = JSON.parse(localStorage.getItem('flappyGameHistory') || '[]');
  }
  updateScore(newScore) {
    this.currentScore = newScore;
    // Update your score display component here if needed
  }
  finishGame() {
    this.recentScore = this.currentScore;
    this.totalGames++;
   
    if (this.currentScore > this.bestScore) {
      this.bestScore = this.currentScore;
      localStorage.setItem('flappyBestScore', this.bestScore.toString());
    }
   
    localStorage.setItem('flappyTotalGames', this.totalGames.toString());
   
    this.gameHistory.unshift(this.currentScore);
    if (this.gameHistory.length > 10) {
      this.gameHistory.pop();
    }
    localStorage.setItem('flappyGameHistory', JSON.stringify(this.gameHistory));
  }
  resetCurrentScore() {
    this.currentScore = 0;
  }
}

// Initialize game stats
const gameStats = new GameStats();

// Season helper functions
function getCurrentSeason() {
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const daysSinceStart = Math.floor((now - startOfYear) / (1000 * 60 * 60 * 24));
    const biWeeklyPeriod = Math.floor(daysSinceStart / 14);
    return `${now.getFullYear()}-season-${biWeeklyPeriod}`;
}
function getSeasonEndDate() {
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const daysSinceStart = Math.floor((now - startOfYear) / (1000 * 60 * 60 * 24));
    const biWeeklyPeriod = Math.floor(daysSinceStart / 14);
    const seasonEndDay = (biWeeklyPeriod + 1) * 14;
    const seasonEnd = new Date(startOfYear);
    seasonEnd.setDate(seasonEndDay);
    return seasonEnd.toISOString().slice(0, 10);
}
// Wallet functionality
class SimpleWalletAdapter {
    constructor() {
        this.connected = false;
        this.publicKey = null;
        this._phantom = null;
    }
    async connect() {
        try {
            if (window.solana && window.solana.isPhantom) {
                this._phantom = window.solana;
                const response = await this._phantom.connect();
                this.publicKey = response.publicKey;
                this.connected = true;
                await this.checkSeasonPass();
                return response;
            } else {
                throw new Error('Phantom wallet not found! Please install Phantom wallet.');
            }
        } catch (error) {
            console.error('Wallet connection failed:', error);
            throw error;
        }
    }
    async checkSeasonPass() {
        if (!this.connected) return;
       
        try {
            const currentSeason = getCurrentSeason();
            const walletKey = this.publicKey.toString();
           
            // Check if player has season pass for current bi-weekly period
            const passRef = db.ref(`season-passes/${currentSeason}/${walletKey}`);
            const snapshot = await passRef.once('value');
           
            hasSeasonPass = snapshot.exists();
            console.log('Season pass status for', currentSeason, ':', hasSeasonPass);
           
            this.updateUI();
        } catch (error) {
            console.error('Error checking season pass:', error);
        }
    }
    updateUI() {
        const payButton = document.getElementById('pay-entry');
        const walletStatus = document.getElementById('wallet-status');
        const currentSeason = getCurrentSeason();
        const seasonEnd = getSeasonEndDate();
       
        if (hasSeasonPass) {
            payButton.textContent = 'Play Game (Season Pass Active)';
            payButton.style.background = '#4CAF50';
            walletStatus.innerHTML += `<br><span style="color: #4CAF50;">✓ Season Pass Active</span><br><small>Season ${currentSeason} ends ${seasonEnd}</small>`;
        } else {
            payButton.textContent = 'Pay 0.02 SOL for Season Pass';
            payButton.style.background = '#FF9800';
            walletStatus.innerHTML += `<br><small>Season ${currentSeason} ends ${seasonEnd}</small>`;
        }
    }
    async disconnect() {
        if (this._phantom) {
            await this._phantom.disconnect();
            this.connected = false;
            this.publicKey = null;
            hasSeasonPass = false;
        }
    }
    async sendTransaction(transaction) {
        if (!this.connected || !this._phantom) {
            throw new Error('Wallet not connected');
        }
        transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
        transaction.feePayer = this.publicKey;
        const signed = await this._phantom.signTransaction(transaction);
        const signature = await connection.sendRawTransaction(signed.serialize());
        await connection.confirmTransaction(signature);
        return signature;
    }
}
// Initialize wallet
const wallet = new SimpleWalletAdapter();
// DOM elements and event handlers
document.addEventListener('DOMContentLoaded', function() {
    const connectButton = document.getElementById('connect-wallet');
    const payButton = document.getElementById('pay-entry');
    const walletStatus = document.getElementById('wallet-status');
    // Connect wallet handler
    connectButton.addEventListener('click', async function() {
        try {
            connectButton.textContent = 'Connecting...';
            connectButton.disabled = true;
            await wallet.connect();
           
            walletStatus.textContent = `Connected: ${wallet.publicKey.toString().slice(0, 4)}...${wallet.publicKey.toString().slice(-4)}`;
            connectButton.textContent = 'Wallet Connected ✓';
            connectButton.style.background = '#2196F3';
            payButton.disabled = false;
        } catch (error) {
            alert(error.message);
            connectButton.textContent = 'Connect Solana Wallet';
            connectButton.disabled = false;
        }
    });
    // Pay entry handler
    payButton.addEventListener('click', async function() {
        if (!wallet.connected) {
            alert('Please connect your wallet first!');
            return;
        }
        // If already has season pass, just start game
        if (hasSeasonPass) {
            startGame();
            return;
        }
        try {
            payButton.textContent = 'Processing Payment...';
            payButton.disabled = true;
            const transaction = new solanaWeb3.Transaction().add(
                solanaWeb3.SystemProgram.transfer({
                    fromPubkey: wallet.publicKey,
                    toPubkey: TREASURY_PUBKEY,
                    lamports: 0.02 * solanaWeb3.LAMPORTS_PER_SOL,
                })
            );
            const signature = await wallet.sendTransaction(transaction);
            console.log('Payment successful:', signature);
            // Record season pass for current bi-weekly period
            const currentSeason = getCurrentSeason();
            const walletKey = wallet.publicKey.toString();
            await db.ref(`season-passes/${currentSeason}/${walletKey}`).set({
                paid: true,
                timestamp: Date.now(),
                transaction: signature,
                season: currentSeason
            });
            hasSeasonPass = true;
            const seasonEnd = getSeasonEndDate();
            alert(`Season pass purchased! You can play unlimited games until ${seasonEnd}!`);
           
            startGame();
        } catch (error) {
            console.error('Payment failed:', error);
            alert('Payment failed: ' + error.message);
            payButton.textContent = 'Pay 0.02 SOL for Season Pass';
            payButton.disabled = false;
        }
    });
});
function startGame() {
    // Hide wallet UI and show game
    document.getElementById('wallet-ui').style.display = 'none';
    document.getElementById('game-container').style.display = 'block';
   
    const config = {
        type: Phaser.AUTO,
        width: 288,
        height: 512,
        parent: 'game-container',
        physics: {
            default: 'arcade',
            arcade: {
                gravity: { y: 980 }, // Original Flappy Bird gravity!
                debug: false
            }
        },
        scene: {
            preload: preload,
            create: create,
            update: update
        }
    };
    if (gameInstance) {
        gameInstance.destroy(true);
        gameInstance = null;
    }
    gameInstance = new Phaser.Game(config);
    gameStats.resetCurrentScore();  // Reset for new game
}
// Game variables
let foot, pipes, ground, groundTiles = [], score = 0, scoreText, gameOver = false, startTime;
let pipeTimer = null; // Track pipe spawn timer
let lastPipeX = 400; // Track last pipe position for consistent spacing
let gameScene = null; // Store scene reference
function preload() {
    // Load game assets with relative paths
    this.load.image('background', './assets/background-day.png');
    this.load.image('ground', './assets/base.png');
    this.load.image('pipe', './assets/pipe-green.png');
    this.load.image('foot-up', './assets/yellowbird-upflap.png');
    this.load.image('foot-mid', './assets/yellowbird-midflap.png');
    this.load.image('foot-down', './assets/yellowbird-downflap.png');
    // Load audio
    this.load.audio('wing', './assets/audio_wing.ogg');
    this.load.audio('point', './assets/audio_point.ogg');
    this.load.audio('die', './assets/audio_die.ogg');
}
function create() {
    console.log('🎮 Game scene created'); // Debug log
   
    gameScene = this; // Store scene reference
    startTime = Date.now();
    gameOver = false;
    score = 0;
    lastPipeX = 400; // Reset pipe position tracking
   
    // Clear any existing timers
    if (pipeTimer) {
        pipeTimer.destroy();
        pipeTimer = null;
    }
   
    // Background
    this.add.image(144, 256, 'background');
    // Create bird (foot) BEFORE pipes so pipes render over it
    foot = this.physics.add.sprite(100, 256, 'foot-mid');
    foot.setScale(1.5);
    foot.body.setSize(17, 12); // Much smaller hitbox like original
    foot.body.setOffset(0, 2); // Center the hitbox
    // Bird animation
    this.anims.create({
        key: 'flap',
        frames: [
            { key: 'foot-up' },
            { key: 'foot-mid' },
            { key: 'foot-down' }
        ],
        frameRate: 10,
        repeat: -1
    });
    foot.play('flap');
    // Pipes group
    pipes = this.physics.add.group();
    // Create scrolling ground tiles AFTER pipes so ground renders on top
    groundTiles = [];
    for (let i = 0; i < 4; i++) {
        const groundTile = this.add.image(i * 336, 490, 'ground');
        groundTile.setOrigin(0, 0.5);
        groundTile.setDepth(10); // Ensure ground is on top layer
        groundTiles.push(groundTile);
    }
    // Ground collision (invisible physics body)
    const groundBody = this.physics.add.staticGroup();
    groundBody.create(144, 450, null).setSize(288, 50).setVisible(false);
    // Collisions with better debugging
    this.physics.add.collider(foot, groundBody, () => {
        console.log('🔥 Bird hit ground!'); // Debug log
        endGame();
    }, null, this);
   
    this.physics.add.collider(foot, pipes, () => {
        console.log('🔥 Bird hit pipe!'); // Debug log
        endGame();
    }, null, this);
    // Score display
    scoreText = this.add.text(16, 16, 'Score: 0', {
        fontSize: '32px',
        fill: '#000',
        fontFamily: 'Arial',
        stroke: '#fff',
        strokeThickness: 4
    });
    scoreText.setDepth(20); // Keep score on top
    // Input handling - FIXED PHYSICS like original
    this.input.on('pointerdown', () => {
        if (gameOver) return;
        foot.setVelocityY(-320); // Strong upward velocity like original
        foot.angle = -25; // Sharp upward angle
        try {
            this.sound.play('wing');
        } catch (e) {
            console.log('Audio play failed');
        }
    });
    // FIXED: Add pipes with consistent spacing every 1.8 seconds
    pipeTimer = this.time.addEvent({
        delay: 1800, // Consistent 1.8 second intervals
        callback: addPipes,
        callbackScope: this,
        loop: true
    });
    // Spawn first pipes after a delay
    this.time.delayedCall(1500, () => addPipes.call(this));
}
function update() {
    if (gameOver) return;
    // Scroll ground tiles (moving ground effect)
    groundTiles.forEach(tile => {
        tile.x -= 2;
        if (tile.x <= -336) {
            tile.x += 336 * 3;
        }
    });
    // FIXED BIRD PHYSICS - Like original Flappy Bird
    if (foot.body.velocity.y < 0) {
        // Going up - keep upward angle briefly
        foot.angle = -25;
    } else {
        // Falling down - gradual nose dive but not extreme
        foot.angle = Math.min(foot.angle + 3, 70); // Max 70 degree dive
    }
    // Check pipe scoring and cleanup
    pipes.getChildren().forEach(pipe => {
        if (pipe.x + pipe.width < 0) {
            pipe.destroy();
        }
       
        if (pipe.x < foot.x - 26 && !pipe.scored) {
            pipe.scored = true;
            if (pipe.type === 'bottom') {
                score++;
                gameStats.updateScore(score);  // Update current score
                scoreText.setText('Score: ' + score);
                try {
                    this.sound.play('point');
                } catch (e) {
                    console.log('Audio play failed');
                }
            }
        }
    });
    // Check if bird goes off screen
    if (foot.y > 450 || foot.y < -50) {
        console.log('🔥 Bird went off screen!'); // Debug log
        endGame();
    }
}
function addPipes() {
    // FIXED: Consistent horizontal spacing between pipe pairs
    const gap = 100; // Original gap size
    const pipeWidth = 52;
    const PIPE_SPACING = 200; // Fixed horizontal distance between pipe pairs
   
    // Position pipes with consistent spacing
    const pipeX = lastPipeX + PIPE_SPACING;
    lastPipeX = pipeX;
   
    // Random height for gap - ensures pipes always spawn from top and bottom
    const minGapTop = 80; // Minimum space from top
    const maxGapTop = 320; // Maximum space from top
    const gapTop = Math.floor(Math.random() * (maxGapTop - minGapTop)) + minGapTop;
    const gapBottom = gapTop + gap;
   
    // TOP PIPE - Always extends from very top down
    const topPipe = pipes.create(pipeX, 0, 'pipe');
    topPipe.setOrigin(0.5, 0); // Anchor at top
    topPipe.setScale(1, gapTop / 320); // Scale to reach gap
    topPipe.body.setSize(pipeWidth, gapTop);
    topPipe.setFlipY(true); // Flip to show opening downward
   
    // BOTTOM PIPE - Always extends from bottom up
    const bottomPipe = pipes.create(pipeX, 512, 'pipe');
    bottomPipe.setOrigin(0.5, 1); // Anchor at bottom
    const bottomHeight = 512 - gapBottom;
    bottomPipe.setScale(1, bottomHeight / 320); // Scale to reach gap
    bottomPipe.body.setSize(pipeWidth, bottomHeight);
    bottomPipe.type = 'bottom'; // For scoring
   
    // Set physics for both pipes
    [topPipe, bottomPipe].forEach(pipe => {
        pipe.setVelocityX(-120); // Original speed
        pipe.body.allowGravity = false;
        pipe.scored = false;
        pipe.setDepth(5); // Behind ground but in front of background
    });
}
function endGame() {
    console.log('💀 GAME OVER! Starting end game sequence...'); // Debug log
   
    if (gameOver) {
        console.log('⚠️ Game already over, skipping...');
        return;
    }
   
    gameOver = true;
   
    gameStats.finishGame();  // Update local storage with scores
   
    // Stop all physics immediately
    if (foot) {
        foot.setVelocityY(0);
        foot.setVelocityX(0);
        if (foot.body) {
            foot.body.setEnable(false); // Disable physics on bird
        }
    }
   
    // Stop all pipes
    if (pipes) {
        pipes.getChildren().forEach(pipe => {
            pipe.setVelocityX(0);
            if (pipe.body) {
                pipe.body.setEnable(false);
            }
        });
    }
   
    // Stop pipe spawning
    if (pipeTimer) {
        pipeTimer.destroy();
        pipeTimer = null;
    }
   
    // Clear all input listeners
    if (gameScene && gameScene.input) {
        gameScene.input.removeAllListeners();
    }
   
    try {
        if (gameScene && gameScene.sound) {
            gameScene.sound.play('die');
        }
    } catch (e) {
        console.log('Audio play failed');
    }
   
    // Submit score (async but don't wait)
    submitScore(score);
   
    console.log('⏳ Showing game over screen in 1 second...'); // Debug log
   
    // Show game over screen immediately with no delay
    showGameOverScreen();
}
function showGameOverScreen() {
    console.log('🎯 Creating game over screen with score:', score); // Debug log
   
    if (!gameScene) {
        console.error('❌ No game scene available!');
        return;
    }
   
    // Dark overlay
    const overlay = gameScene.add.rectangle(144, 256, 288, 512, 0x000000, 0.8);
    overlay.setDepth(200);
   
    // Game Over panel background - use graphics for border
    const graphics = gameScene.add.graphics();
    graphics.fillStyle(0xFFFFFF);
    graphics.fillRect(24, 156, 240, 200); // x, y, width, height
    graphics.lineStyle(3, 0x000000);
    graphics.strokeRect(24, 156, 240, 200);
    graphics.setDepth(201);
   
    // Game Over text
    const gameOverText = gameScene.add.text(144, 180, 'GAME OVER', {
        fontSize: '28px',
        fill: '#FF0000',
        fontFamily: 'Press Start 2P',  // Retro font
        fontStyle: 'bold'
    });
    gameOverText.setOrigin(0.5);
    gameOverText.setDepth(202);
   
    // Score display
    const scoreDisplay = gameScene.add.text(144, 220, `Score: ${score}`, {
        fontSize: '22px',
        fill: '#000000',
        fontFamily: 'Press Start 2P',  // Retro font
        fontStyle: 'bold'
    });
    scoreDisplay.setOrigin(0.5);
    scoreDisplay.setDepth(202);
   
    // Recent score
    const recentScoreText = gameScene.add.text(144, 250, `Recent: ${gameStats.recentScore}`, {
        fontSize: '18px',
        fill: '#FF69B4',  // Pink for recent
        fontFamily: 'Press Start 2P',  // Retro font
        fontStyle: 'bold'
    });
    recentScoreText.setOrigin(0.5);
    recentScoreText.setDepth(202);
   
    // Best score
    const bestScoreText = gameScene.add.text(144, 280, `Best: ${gameStats.bestScore}`, {
        fontSize: '18px',
        fill: '#00BFFF',  // Blue for best
        fontFamily: 'Press Start 2P',  // Retro font
        fontStyle: 'bold'
    });
    bestScoreText.setOrigin(0.5);
    bestScoreText.setDepth(202);
   
    // Create buttons as graphics objects
    const buttonGraphics = gameScene.add.graphics();
    buttonGraphics.setDepth(201);
   
    // Restart button
    buttonGraphics.fillStyle(0x4CAF50);
    buttonGraphics.fillRect(74, 310, 140, 35); // Adjusted position for new texts
    buttonGraphics.lineStyle(2, 0x000000);
    buttonGraphics.strokeRect(74, 310, 140, 35);
   
    // Share button
    buttonGraphics.fillStyle(0x2196F3);
    buttonGraphics.fillRect(74, 355, 140, 35);
    buttonGraphics.strokeRect(74, 355, 140, 35);
   
    // Menu button
    buttonGraphics.fillStyle(0xFF9800);
    buttonGraphics.fillRect(74, 400, 140, 35);
    buttonGraphics.strokeRect(74, 400, 140, 35);
   
    // Button text with retro font
    const restartText = gameScene.add.text(144, 327, 'RESTART', {
        fontSize: '16px',
        fill: '#FFFFFF',
        fontFamily: 'Press Start 2P',  // Retro font
        fontStyle: 'bold'
    });
    restartText.setOrigin(0.5);
    restartText.setDepth(202);
   
    const shareText = gameScene.add.text(144, 372, 'SHARE', {
        fontSize: '16px',
        fill: '#FFFFFF',
        fontFamily: 'Press Start 2P',  // Retro font
        fontStyle: 'bold'
    });
    shareText.setOrigin(0.5);
    shareText.setDepth(202);
   
    const menuText = gameScene.add.text(144, 417, 'MAIN MENU', {
        fontSize: '16px',
        fill: '#FFFFFF',
        fontFamily: 'Press Start 2P',  // Retro font
        fontStyle: 'bold'
    });
    menuText.setOrigin(0.5);
    menuText.setDepth(202);
   
    // Create invisible interactive zones for buttons
    const restartZone = gameScene.add.zone(144, 327, 140, 35);
    restartZone.setInteractive({ useHandCursor: true });
    restartZone.setDepth(203);
   
    const shareZone = gameScene.add.zone(144, 372, 140, 35);
    shareZone.setInteractive({ useHandCursor: true });
    shareZone.setDepth(203);
   
    const menuZone = gameScene.add.zone(144, 417, 140, 35);
    menuZone.setInteractive({ useHandCursor: true });
    menuZone.setDepth(203);
   
    console.log('✅ Game over screen created successfully!'); // Debug log
   
    // Button interactions
    restartZone.on('pointerdown', () => {
        console.log('🔄 Restart button clicked'); // Debug log
        gameScene.scene.restart();
    });
   
    shareZone.on('pointerdown', () => {
        console.log('📤 Share button clicked'); // Debug log
        shareScore(gameStats);
    });
   
    menuZone.on('pointerdown', () => {
        console.log('🏠 Menu button clicked'); // Debug log
        // Return to main menu
        if (gameInstance) {
            gameInstance.destroy(true);
            gameInstance = null;
        }
        document.getElementById('wallet-ui').style.display = 'block';
        document.getElementById('game-container').style.display = 'none';
    });
   
    // Click anywhere else to restart
    overlay.setInteractive();
    overlay.on('pointerdown', () => {
        console.log('🖱️ Clicked overlay to restart'); // Debug log
        gameScene.scene.restart();
    });
}
// Share Function
function shareScore(gameStats) {
  const text = `I just scored ${gameStats.recentScore} points in Flappy Foot! My best is ${gameStats.bestScore}. Can you beat it?`;
 
  if (navigator.share) {
    navigator.share({
      title: 'Flappy Foot Score',
      text: text,
      url: window.location.href
    });
  } else {
    navigator.clipboard.writeText(text + ' ' + window.location.href).then(() => {
      alert('Score copied to clipboard!');
    });
  }
}
// Leaderboard Function
function showLeaderboard(gameStats) {
  const history = gameStats.gameHistory.slice(0, 5);
  let message = `🏆 YOUR RECENT SCORES 🏆\n\n`;
 
  if (history.length === 0) {
    message += 'No games played yet!';
  } else {
    history.forEach((score, index) => {
      message += `${index + 1}. ${score} points\n`;
    });
    message += `\nBest Score: ${gameStats.bestScore}`;
    message += `\nTotal Games: ${gameStats.totalGames}`;
  }
 
  alert(message);
}
async function submitScore(finalScore) {
    try {
        if (!wallet.connected || !wallet.publicKey) {
            console.log('Wallet not connected - score not submitted');
            return;
        }
        const walletKey = wallet.publicKey.toString();
        const currentSeason = getCurrentSeason();
        const seasonEnd = getSeasonEndDate();
       
        // Store score under current season, not daily
        const scoreRef = db.ref(`seasonal-scores/${currentSeason}/${walletKey}`);
        const existingSnapshot = await scoreRef.once('value');
       
        // Only update if new score is higher OR if no score exists
        if (!existingSnapshot.exists() || finalScore > existingSnapshot.val().score) {
            await scoreRef.set({
                score: finalScore,
                timestamp: Date.now(),
                wallet: walletKey,
                season: currentSeason,
                seasonEnd: seasonEnd
            });
           
            console.log('New season high score submitted:', finalScore);
        } else {
            console.log('Score submitted:', finalScore);
           
            // Still update the attempt for analytics
            await db.ref(`seasonal-scores/${currentSeason}/${walletKey}/attempts`).push({
                score: finalScore,
                timestamp: Date.now()
            });
        }
       
    } catch (error) {
        console.error('Score submission failed:', error);
    }
}
// Export for debugging
window.gameDebug = {
    wallet,
    connection,
    hasSeasonPass: () => hasSeasonPass,
    getCurrentSeason,
    getSeasonEndDate,
    resetSeasonPass: () => { hasSeasonPass = false; },
    restart: () => startGame(),
    triggerGameOver: () => endGame(),
    gameState: () => ({ gameOver, score, gameScene })
};
