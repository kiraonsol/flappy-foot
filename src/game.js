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
        backgroundColor: '#70c5ce',
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
    }
    gameInstance = new Phaser.Game(config);
}

// Game variables
let foot, pipes, ground, groundTiles = [], score = 0, scoreText, gameOver = false, startTime;

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
    startTime = Date.now();
    
    // Background
    this.add.image(144, 256, 'background');

    // Create bird (foot) BEFORE pipes so pipes render over it
    foot = this.physics.add.sprite(50, 256, 'foot-mid');
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

    // Collisions
    this.physics.add.collider(foot, groundBody, endGame, null, this);
    this.physics.add.collider(foot, pipes, endGame, null, this);

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

    // Add pipes every 1.5 seconds (original timing)
    this.time.addEvent({
        delay: 1500,
        callback: addPipes,
        callbackScope: this,
        loop: true
    });

    // Spawn first pipes immediately
    this.time.delayedCall(1200, () => addPipes.call(this));
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
        endGame.call(this);
    }
}

function addPipes() {
    const gap = 100; // Original gap size
    const pipeWidth = 52;
    
    // Random height for gap - ensures pipes always spawn from top and bottom
    const minGapTop = 80;  // Minimum space from top
    const maxGapTop = 320; // Maximum space from top
    const gapTop = Math.floor(Math.random() * (maxGapTop - minGapTop)) + minGapTop;
    const gapBottom = gapTop + gap;
    
    // TOP PIPE - Always extends from very top down
    const topPipe = pipes.create(288, 0, 'pipe');
    topPipe.setOrigin(0.5, 0); // Anchor at top
    topPipe.setScale(1, gapTop / 320); // Scale to reach gap
    topPipe.body.setSize(pipeWidth, gapTop);
    topPipe.setFlipY(true); // Flip to show opening downward
    
    // BOTTOM PIPE - Always extends from bottom up  
    const bottomPipe = pipes.create(288, 512, 'pipe');
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
    if (gameOver) return;
    
    gameOver = true;
    
    try {
        this.sound.play('die');
    } catch (e) {
        console.log('Audio play failed');
    }
    
    // Anti-cheat: Check if score is reasonable
    const elapsed = (Date.now() - startTime) / 1000;
    const maxPossibleScore = Math.floor(elapsed / 1.5) + 2; // Based on pipe spawn rate
    
    if (score > maxPossibleScore) {
        alert('Invalid score detected! Score not submitted.');
        showRestartUI();
        return;
    }
    
    // Submit score
    submitScore(score);
    
    // Game over display
    this.add.rectangle(144, 256, 288, 512, 0x000000, 0.7);
    
    const gameOverGroup = this.add.group();
    
    gameOverGroup.add(this.add.text(144, 180, 'Game Over', {
        fontSize: '36px',
        fill: '#fff',
        fontFamily: 'Arial',
        stroke: '#000',
        strokeThickness: 3
    }).setOrigin(0.5));
    
    gameOverGroup.add(this.add.text(144, 230, `Final Score: ${score}`, {
        fontSize: '24px',
        fill: '#fff',
        fontFamily: 'Arial',
        stroke: '#000',
        strokeThickness: 2
    }).setOrigin(0.5));
    
    gameOverGroup.add(this.add.text(144, 280, 'Click to Play Again', {
        fontSize: '18px',
        fill: '#ffff99',
        fontFamily: 'Arial'
    }).setOrigin(0.5));

    // Play again functionality
    this.input.off('pointerdown'); // Remove existing listener
    this.input.on('pointerdown', () => {
        startGame(); // Restart without payment if season pass active
    });
}

function showRestartUI() {
    // Show restart option without payment for season pass holders
    this.input.off('pointerdown');
    this.input.on('pointerdown', () => {
        startGame();
    });
}

async function submitScore(finalScore) {
    try {
        if (!wallet.connected || !wallet.publicKey) {
            alert('Wallet not connected - score not submitted');
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
            alert(`🏆 New season high score: ${finalScore}!\nSeason ends: ${seasonEnd}`);
        } else {
            const currentHigh = existingSnapshot.val().score;
            console.log('Score submitted:', finalScore);
            alert(`Score: ${finalScore}\nSeason high: ${currentHigh}\nSeason ends: ${seasonEnd}`);
            
            // Still store the attempt for analytics
            await db.ref(`seasonal-scores/${currentSeason}/${walletKey}/attempts`).push({
                score: finalScore,
                timestamp: Date.now()
            });
        }
        
    } catch (error) {
        console.error('Score submission failed:', error);
        alert('Score submission failed: ' + error.message);
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
    restart: () => startGame()
};
