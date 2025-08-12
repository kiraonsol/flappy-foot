const anchor = require('@coral-xyz/anchor');
const solana = require('@solana/web3.js');
const firebase = require('firebase/app');
require('firebase/database');

const { AnchorProvider, Program, Wallet } = anchor;
const { Connection, Keypair, PublicKey } = solana;

const connection = new Connection('https://api.devnet.solana.com');
const wallet = new Wallet(Keypair.fromSecretKey(Uint8Array.from([/* Your admin key array */]))); // Secure this!
const provider = new AnchorProvider(connection, wallet, {});

const IDL = {
  "version": "0.1.0",
  "name": "flappy_foot",
  "instructions": [
    {
      "name": "initialize",
      "accounts": [
        {
          "name": "treasury",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "admin",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": []
    },
    {
      "name": "enter",
      "accounts": [
        {
          "name": "treasury",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "player",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": []
    },
    {
      "name": "endSeason",
      "accounts": [
        {
          "name": "treasury",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "admin",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "winner1",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "winner2",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "winner3",
          "isMut": true,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "winner1",
          "type": "publicKey"
        },
        {
          "name": "winner2",
          "type": "publicKey"
        },
        {
          "name": "winner3",
          "type": "publicKey"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "Treasury",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "publicKey"
          },
          {
            "name": "pot",
            "type": "u64"
          },
          {
            "name": "seasonEnd",
            "type": "i64"
          }
        ]
      }
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "Unauthorized"
    },
    {
      "code": 6001,
      "name": "SeasonActive"
    }
  ]
};

const program = new Program(IDL, new PublicKey('3m4RoVcWZ1GZweNpU2CiVRP1GVMHaxQ7TPFQCjHGtD7f'), provider);

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

async function endSeason() {
    const seasonDate = new Date().toISOString().slice(0, 10);
    const scoresRef = db.ref(`scores/${seasonDate}`);
    const snapshot = await scoresRef.orderByChild('score').limitToLast(3).once('value');
    const topScores = [];
    snapshot.forEach(child => topScores.unshift({ wallet: child.key, score: child.val().score }));
    
    if (topScores.length < 3) return console.log('Not enough players');

    const [top1, top2, top3] = topScores.map(s => new PublicKey(s.wallet));
    await program.methods.endSeason(top1, top2, top3).accounts({
        treasury: new PublicKey('9euu6jdRP2Uhi3qYihptK3aVLx8Gj1w6R3ALhLjr8XDN'),  // Your Treasury PDA
        admin: wallet.publicKey,
        winner1: top1,
        winner2: top2,
        winner3: top3,
    }).rpc();
    console.log('Payouts distributed!');
}

endSeason();