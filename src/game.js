import { Connection, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-wallets';
import { WalletProvider, ConnectionProvider, useWallet } from '@solana/wallet-adapter-react';
import { WalletModalProvider, WalletMultiButton } from '@solana/wallet-adapter-react-ui';

const wallets = [new PhantomWalletAdapter()];
const connection = new Connection('https://api.devnet.solana.com');
const TREASURY_PUBKEY = new PublicKey('9euu6jdRP2Uhi3qYihptK3aVLx8Gj1w6R3ALhLjr8XDN');  // Your Treasury PDA

// Your Firebase config
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
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

function App() {
    const wallet = useWallet();
    const [gameStarted, setGameStarted] = React.useState(false);

    async function payEntry() {
        if (!wallet.connected) return alert('Connect wallet first!');
        try {
            const tx = new Transaction().add(
                SystemProgram.transfer({
                    fromPubkey: wallet.publicKey,
                    toPubkey: TREASURY_PUBKEY,
                    lamports: 0.02 * LAMPORTS_PER_SOL,
                })
            );
            await wallet.sendTransaction(tx, connection);
            alert('Entry paid! Starting game...');
            setGameStarted(true);
            document.getElementById('wallet-ui').style.display = 'none';
            document.getElementById('game-container').style.display = 'block';
            startGame();
        } catch (e) {
            alert('Payment failed: ' + e.message);
        }
    }

    React.useEffect(() => {
        document.getElementById('pay-entry').onclick = payEntry;
        document.getElementById('pay-entry').disabled = !wallet.connected;
    }, [wallet.connected]);

    return <WalletMultiButton id="connect-wallet" />;
}

ReactDOM.render(
    <ConnectionProvider endpoint={connection.endpoint}>
        <WalletProvider wallets={wallets} autoConnect>
            <WalletModalProvider>
                <App />
            </WalletModalProvider>
        </WalletProvider>
    </ConnectionProvider>,
    document.getElementById('wallet-ui')
);

// Phaser Game
function startGame() {
    const config = {
        type: Phaser.AUTO,
        width: 288,
        height: 512,
        parent: 'game-container',
        physics: { default: 'arcade', arcade: { gravity: { y: 400 }, debug: false } },
        scene: { preload, create, update }
    };
    const game = new Phaser.Game(config);

    let foot, pipes, score = 0, scoreText, gameOver = false, startTime;
    const flapSound = new Audio('assets/audio_wing.ogg');  // Updated to .ogg from your repo
    const scoreSound = new Audio('assets/audio_point.ogg');  // Updated to .ogg
    const dieSound = new Audio('assets/audio_die.ogg');  // Updated to .ogg

    function preload() {
        this.load.image('background', 'assets/background-day.png');  // Exact name from repo
        this.load.image('ground', 'assets/base.png');  // Exact name
        this.load.image('pipe', 'assets/pipe-green.png');  // Exact name
        this.load.image('foot-up', 'assets/yellowbird-upflap.png');  // Exact name
        this.load.image('foot-mid', 'assets/yellowbird-midflap.png');  // Exact name
        this.load.image('foot-down', 'assets/yellowbird-downflap.png');  // Exact name
    }

    function create() {
        startTime = Date.now();
        this.add.image(144, 256, 'background');
        const ground = this.physics.add.staticGroup();
        ground.create(144, 490, 'ground').setScale(2).refreshBody();

        foot = this.physics.add.sprite(50, 256, 'foot-mid').setScale(1.5);
        foot.setCollideWorldBounds(true);
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

        pipes = this.physics.add.group();
        this.physics.add.collider(foot, ground, endGame, null, this);
        this.physics.add.collider(foot, pipes, endGame, null, this);

        scoreText = this.add.text(16, 16, 'Score: 0', { fontSize: '32px', fill: '#000' });

        this.input.on('pointerdown', () => {
            if (gameOver) return;
            foot.setVelocityY(-200);
            foot.angle = -15;
            flapSound.play();
        });

        this.time.addEvent({ delay: 1500, callback: addPipes, callbackScope: this, loop: true });
    }

    function update() {
        if (gameOver) return;
        if (foot.angle < 90) foot.angle += 2;

        pipes.getChildren().forEach(pipe => {
            if (pipe.x + pipe.width < 0) pipe.destroy();
            if (pipe.x < foot.x && !pipe.scored) {
                pipe.scored = true;
                if (pipe.type === 'bottom') {
                    score++;
                    scoreText.setText('Score: ' + score);
                    scoreSound.play();
                }
            }
        });
    }

    function addPipes() {
        const gap = 150;
        const height = Math.floor(Math.random() * (512 - gap - 200)) + 100;
        const topPipe = pipes.create(288, height - 320 - gap / 2, 'pipe').setFlipY(true);
        const bottomPipe = pipes.create(288, height + gap / 2, 'pipe');
        bottomPipe.type = 'bottom';
        [topPipe, bottomPipe].forEach(pipe => {
            pipe.setVelocityX(-200);
            pipe.body.allowGravity = false;
            pipe.scored = false;
        });
    }

    function endGame() {
        if (gameOver) return;
        gameOver = true;
        dieSound.play();
        const elapsed = (Date.now() - startTime) / 1000;
        if (score > elapsed * 1.5) return alert('Invalid score detected!');
        submitScore(score);
        this.add.text(144, 256, `Game Over\nScore: ${score}`, { fontSize: '32px', fill: '#FFF', align: 'center' }).setOrigin(0.5);
    }

    async function submitScore(score) {
        const walletKey = useWallet().publicKey?.toString();
        if (!walletKey) return alert('Wallet not connected');
        db.ref('scores/' + new Date().toISOString().slice(0, 10) + '/' + walletKey).set({
            score,
            timestamp: Date.now()
        }).then(() => alert('Score submitted!')).catch(e => alert('Submit failed: ' + e));
    }
}
