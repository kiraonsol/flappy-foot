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
            const today = new Date().toISOString().slice(0, 10);
            const walletKey = this.publicKey.toString();
            
            // Check if player has already paid today (season pass)
            const passRef = db.ref(`season-passes/${today}/${walletKey}`);
            const snapshot = await passRef.once('value');
            
            hasSeasonPass = snapshot.exists();
            console.log('Season pass status:', hasSeasonPass);
            
            this.updateUI();
        } catch (error) {
            console.error('Error checking season pass:', error);
        }
    }

    updateUI() {
        const payButton = document.getElementById('pay-entry');
        const walletStatus = document.getElementById('wallet-status');
        
        if (hasSeasonPass) {
            payButton.textContent = 'Play Game (Paid)';
            payButton.style.background = '#4CAF50';
            walletStatus.innerHTML += '<br><span style="color: #4CAF50;">✓ Season Pass Active</span>';
        } else {
            payButton.textContent = 'Pay 0.02 SOL for Season Pass';
            payButton.style.background = '#FF9800';
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

            // Record season pass
            const today = new Date().toISOString().slice(0, 10);
            const walletKey = wallet.publicKey.toString();
            await db.ref(`season-passes/${today}/${walletKey}`).set({
                paid: true,
                timestamp: Date.now(),
                transaction: signature
            });

            hasSeasonPass = true;
            alert('Season pass purchased! You can play unlimited games today!');
            
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
                gravity: { y: 300 }, // Reduced gravity for better feel
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

    // Create scrolling ground tiles
    groundTiles = [];
    for (let i = 0; i < 3; i++) {
        const groundTile = this.add.image(i * 336, 490, 'ground');
        groundTile.setOrigin(0, 0.5);
        groundTiles.push(groundTile);
    }

    // Ground collision (invisible physics body)
    const groundBody = this.physics.add.staticGroup();
    groundBody.create(144, 490, null).setSize(288, 100).setVisible(false);

    // Create bird (foot)
    foot = this.physics.add.sprite(50, 256, 'foot-mid');
    foot.setScale(1.5);
    foot.body.setSize(20, 20); // Smaller hitbox for better gameplay

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

    // Input handling - improved physics
    this.input.on('pointerdown', () => {
        if (gameOver) return;
        foot.setVelocityY(-230); // Better jump velocity
        foot.angle = -20; // Less aggressive angle
        try {
            this.sound.play('wing');
        } catch (e) {
            console.log('Audio play failed');
        }
    });

    // Add pipes every 1.8 seconds (better spacing)
    this.time.addEvent({
        delay: 1800,
        callback: addPipes,
        callbackScope: this,
        loop: true
    });

    // Initial pipe spawn
    this.time.delayedCall(1000, () => addPipes.call(this));
}

function update() {
    if (gameOver) return;

    // Scroll ground tiles
    groundTiles.forEach(tile => {
        tile.x -= 2;
        if (tile.x <= -336) {
            tile.x += 336 * 3;
        }
    });

    // Improved bird rotation - more realistic
    if (foot.body.velocity.y < -50) {
        foot.angle = -20; // Upward angle when jumping
    } else if (foot.body.velocity.y > 50) {
        foot.angle = Math.min(foot.angle + 1.5, 20); // Gradual downward tilt
    }

    // Check pipe scoring and cleanup
    pipes.getChildren().forEach(pipe => {
        if (pipe.x + pipe.width < 0) {
            pipe.destroy();
        }
        
        if (pipe.x < foot.x && !pipe.scored) {
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
    if (foot.y > 512 || foot.y < 0) {
        endGame.call(this);
    }
}

function addPipes() {
    const gap = 120; // Consistent gap size
    const minPipeHeight = 50;
    const maxPipeHeight = 320;
    
    // Random height for the gap center
    const gapCenter = Math.floor(Math.random() * (maxPipeHeight - minPipeHeight - gap)) + minPipeHeight + gap/2;
    
    // Top pipe (extends from top down)
    const topPipe = pipes.create(288, gapCenter - gap/2, 'pipe');
    topPipe.setOrigin(0.5, 1); // Anchor at bottom of pipe
    topPipe.setFlipY(true);
    topPipe.body.setSize(52, topPipe.height);
    
    // Bottom pipe (extends from bottom up)  
    const bottomPipe = pipes.create(288, gapCenter + gap/2, 'pipe');
    bottomPipe.setOrigin(0.5, 0); // Anchor at top of pipe
    bottomPipe.type = 'bottom';
    bottomPipe.body.setSize(52, bottomPipe.height);
    
    // Set physics for both pipes
    [topPipe, bottomPipe].forEach(pipe => {
        pipe.setVelocityX(-160); // Consistent with original speed
        pipe.body.allowGravity = false;
        pipe.scored = false;
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
    const maxPossibleScore = Math.floor(elapsed / 1.8) + 2; // Based on pipe spawn rate
    
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
        const today = new Date().toISOString().slice(0, 10);
        
        // Check for existing score today
        const existingRef = db.ref(`scores/${today}/${walletKey}/score`);
        const existingSnapshot = await existingRef.once('value');
        
        // Only update if new score is higher
        if (!existingSnapshot.exists() || finalScore > existingSnapshot.val()) {
            await db.ref(`scores/${today}/${walletKey}`).set({
                score: finalScore,
                timestamp: Date.now(),
                wallet: walletKey,
                highScore: true
            });
            
            console.log('New high score submitted:', finalScore);
            alert(`New high score: ${finalScore}!`);
        } else {
            console.log('Score submitted:', finalScore);
            alert(`Score submitted: ${finalScore}`);
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
    resetSeasonPass: () => { hasSeasonPass = false; },
    restart: () => startGame()
};
