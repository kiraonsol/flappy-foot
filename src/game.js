javascript// Game configuration and globals
let walletConnection = null;
let playerWallet = null;
let gameInstance = null;

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
                return response;
            } else {
                throw new Error('Phantom wallet not found! Please install Phantom wallet.');
            }
        } catch (error) {
            console.error('Wallet connection failed:', error);
            throw error;
        }
    }

    async disconnect() {
        if (this._phantom) {
            await this._phantom.disconnect();
            this.connected = false;
            this.publicKey = null;
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

            alert('Entry paid successfully! Starting game...');
            
            // Hide wallet UI and show game
            document.getElementById('wallet-ui').style.display = 'none';
            document.getElementById('game-container').style.display = 'block';
            
            startGame();

        } catch (error) {
            console.error('Payment failed:', error);
            alert('Payment failed: ' + error.message);
            payButton.textContent = 'Pay 0.02 SOL to Play';
            payButton.disabled = false;
        }
    });
});

// Phaser Game
function startGame() {
    const config = {
        type: Phaser.AUTO,
        width: 288,
        height: 512,
        parent: 'game-container',
        backgroundColor: '#70c5ce',
        physics: {
            default: 'arcade',
            arcade: {
                gravity: { y: 400 },
                debug: false
            }
        },
        scene: {
            preload: preload,
            create: create,
            update: update
        }
    };

    gameInstance = new Phaser.Game(config);
}

// Game variables
let foot, pipes, score = 0, scoreText, gameOver = false, startTime;

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
    
    // Background and ground
    this.add.image(144, 256, 'background');
    const ground = this.physics.add.staticGroup();
    ground.create(144, 490, 'ground').setScale(2, 1).refreshBody();

    // Create bird (foot)
    foot = this.physics.add.sprite(50, 256, 'foot-mid');
    foot.setScale(1.5);
    foot.setCollideWorldBounds(true);

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
    this.physics.add.collider(foot, ground, endGame, null, this);
    this.physics.add.collider(foot, pipes, endGame, null, this);

    // Score display
    scoreText = this.add.text(16, 16, 'Score: 0', {
        fontSize: '32px',
        fill: '#000',
        fontFamily: 'Arial',
        stroke: '#fff',
        strokeThickness: 4
    });

    // Input handling
    this.input.on('pointerdown', () => {
        if (gameOver) return;
        foot.setVelocityY(-200);
        foot.angle = -15;
        this.sound.play('wing');
    });

    // Add pipes every 1.5 seconds
    this.time.addEvent({
        delay: 1500,
        callback: addPipes,
        callbackScope: this,
        loop: true
    });
}

function update() {
    if (gameOver) return;

    // Bird rotation
    if (foot.angle < 90) {
        foot.angle += 2;
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
                this.sound.play('point');
            }
        }
    });
}

function addPipes() {
    const gap = 150;
    const minHeight = 100;
    const maxHeight = 300;
    const height = Math.floor(Math.random() * (maxHeight - minHeight)) + minHeight;
    
    // Top pipe
    const topPipe = pipes.create(288, height - 160 - gap / 2, 'pipe');
    topPipe.setFlipY(true);
    topPipe.setOrigin(0, 1);
    
    // Bottom pipe
    const bottomPipe = pipes.create(288, height + gap / 2, 'pipe');
    bottomPipe.setOrigin(0, 0);
    bottomPipe.type = 'bottom';
    
    // Set physics for both pipes
    [topPipe, bottomPipe].forEach(pipe => {
        pipe.setVelocityX(-200);
        pipe.body.allowGravity = false;
        pipe.scored = false;
    });
}

function endGame() {
    if (gameOver) return;
    
    gameOver = true;
    this.sound.play('die');
    
    // Anti-cheat: Check if score is reasonable
    const elapsed = (Date.now() - startTime) / 1000;
    const maxPossibleScore = Math.floor(elapsed / 1.5) + 1; // One point per pipe spawn + buffer
    
    if (score > maxPossibleScore) {
        alert('Invalid score detected! Score not submitted.');
        return;
    }
    
    // Submit score
    submitScore(score);
    
    // Game over display
    this.add.rectangle(144, 256, 288, 512, 0x000000, 0.5);
    this.add.text(144, 200, 'Game Over', {
        fontSize: '36px',
        fill: '#fff',
        fontFamily: 'Arial'
    }).setOrigin(0.5);
    
    this.add.text(144, 250, `Final Score: ${score}`, {
        fontSize: '24px',
        fill: '#fff',
        fontFamily: 'Arial'
    }).setOrigin(0.5);
    
    this.add.text(144, 300, 'Click to restart', {
        fontSize: '18px',
        fill: '#ccc',
        fontFamily: 'Arial'
    }).setOrigin(0.5);

    // Restart on click
    this.input.on('pointerdown', () => {
        if (gameInstance) {
            gameInstance.destroy(true);
        }
        document.getElementById('wallet-ui').style.display = 'block';
        document.getElementById('game-container').style.display = 'none';
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
        
        await db.ref(`scores/${today}/${walletKey}`).set({
            score: finalScore,
            timestamp: Date.now(),
            wallet: walletKey
        });
        
        console.log('Score submitted successfully');
        alert(`Score ${finalScore} submitted successfully!`);
        
    } catch (error) {
        console.error('Score submission failed:', error);
        alert('Score submission failed: ' + error.message);
    }
}

// Export for debugging
window.gameDebug = {
    wallet,
    connection,
    restart: () => {
        if (gameInstance) {
            gameInstance.destroy(true);
        }
        startGame();
    }
};
