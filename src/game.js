// REPLACE ONLY THESE FUNCTIONS IN YOUR EXISTING game.js

// Replace the create() function with this:
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

// Replace the update() function with this:
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

// Replace the addPipes() function with this:
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

// ALSO UPDATE your Phaser config to have original physics:
// In your startGame() function, replace the config with this:
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
