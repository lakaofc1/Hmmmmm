const { default: makeWASocket, useMultiFileAuthState, delay, makeCacheableSignalKeyStore } = require("@whiskeysockets/baileys");
const express = require('express');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Web Frontend Interface
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>WhatsApp Pair Code</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                body { font-family: Arial, sans-serif; background: #0f172a; color: #fff; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                .card { background: #1e293b; padding: 30px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.5); width: 100%; max-width: 400px; text-align: center; }
                input { width: 90%; padding: 12px; margin: 15px 0; border: 1px solid #475569; background: #0f172a; color: #fff; border-radius: 6px; font-size: 16px; }
                button { background: #22c55e; color: white; border: none; padding: 12px 20px; width: 100%; border-radius: 6px; font-size: 16px; cursor: pointer; font-weight: bold; }
                button:hover { background: #16a34a; }
                #result { margin-top: 20px; font-size: 18px; word-break: break-all; }
            </style>
        </head>
        <body>
            <div class="card">
                <h2>WhatsApp Pair Code</h2>
                <p>Enter your WhatsApp number with country code (e.g., 94771234567)</p>
                <input type="text" id="phone" placeholder="94771234567">
                <button onclick="getPairCode()">Get Pair Code</button>
                <div id="result"></div>
            </div>
            <script>
                async function getPairCode() {
                    const phone = document.getElementById('phone').value;
                    const resultDiv = document.getElementById('result');
                    if(!phone) { alert('Please enter phone number'); return; }
                    resultDiv.innerHTML = "Generating code, please wait...";
                    try {
                        const res = await fetch('/code?phone=' + encodeURIComponent(phone));
                        const data = await res.json();
                        if(data.code) {
                            resultDiv.innerHTML = "<h3>Your Pairing Code:</h3><h1 style='color:#22c55e;background:#0f172a;padding:10px;border-radius:6px;letter-spacing:2px;'>" + data.code + "</h1><p>Enter this code on your phone within 30 seconds!</p>";
                        } else {
                            resultDiv.innerHTML = "Error: " + (data.error || "Failed to generate");
                        }
                    } catch(e) {
                        resultDiv.innerHTML = "Connection Error!";
                    }
                }
            </script>
        </body>
        </html>
    `);
});

app.get('/code', async (req, res) => {
    let phone = req.query.phone;
    if (!phone) return res.json({ error: "Phone number is required" });
    phone = phone.replace(/[^0-9]/g, '');

    const sessionDir = path.join(__dirname, 'sessions', '_' + phone);
    if (fs.existsSync(sessionDir)) {
        fs.rmSync(sessionDir, { recursive: true, force: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    try {
        const sock = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }))
            },
            printQRInTerminal: false,
            logger: pino({ level: "fatal" }),
            browser: ["Chrome (Linux)", "", ""]
        });

        sock.ev.on('creds.update', saveCreds);

        if (!sock.authState.creds.registered) {
            // Heroku වලට time එක දීල smoothly connect වෙන්න delay එක වැඩි කළා
            await delay(3000);
            let code = await sock.requestPairingCode(phone);
            code = code?.match(/.{1,4}/g)?.join("-") || code;
            res.json({ code: code });
        } else {
            res.json({ error: "Already registered" });
        }

        sock.ev.on('connection.update', async (update) => {
            const { connection } = update;
            if (connection === 'open') {
                await delay(4000);
                
                const credsPath = path.join(sessionDir, 'creds.json');
                if (fs.existsSync(credsPath)) {
                    const credsBuffer = fs.readFileSync(credsPath);
                    const base64Session = credsBuffer.toString('base64');
                    
                    // 1. Send Session File Document
                    await sock.sendMessage(sock.user.id, {
                        document: credsBuffer,
                        mimetype: 'application/json',
                        fileName: 'creds.json',
                        caption: `*✅ WhatsApp Connected Successfully!*\n\nHere is your creds.json session file.`
                    });

                    // 2. Send Base64 Session ID String
                    await sock.sendMessage(sock.user.id, {
                        text: `*🔑 Your Session ID:*\n\nSESSION_ID;;;${base64Session}`
                    });
                }

                // Clean up session directory
                setTimeout(() => {
                    if (fs.existsSync(sessionDir)) {
                        fs.rmSync(sessionDir, { recursive: true, force: true });
                    }
                }, 10000);
            }
        });

    } catch (err) {
        console.error(err);
        if (!res.headersSent) {
            res.json({ error: "Internal Server Error" });
        }
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
