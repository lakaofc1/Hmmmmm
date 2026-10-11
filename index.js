const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    Browsers
} = require('@whiskeysockets/baileys');

const express = require('express');
const fs = require('fs');
const path = require('path');
const pino = require('pino');
const QRCode = require('qrcode');
const NodeCache = require('node-cache');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;
const msgRetryCounterCache = new NodeCache({ stdTTL: 0, checkperiod: 0 });

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/qr', async (req, res) => {
    const sessionName = `session_${Date.now()}`;
    const sessionDir = path.join(__dirname, sessionName);

    try {
        if (!fs.existsSync(sessionDir)) {
            fs.mkdirSync(sessionDir, { recursive: true });
        }

        const { version } = await fetchLatestBaileysVersion();
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        const logger = pino({ level: 'fatal' });

        const sock = makeWASocket({
            version,
            logger,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger)
            },
            printQRInTerminal: false,
            generateHighQualityLinkPreview: true,
            syncFullHistory: false,
            browser: Browsers.macOS("Desktop"),
            msgRetryCounterCache
        });

        sock.ev.on('creds.update', saveCreds);

        let qrSent = false;

        sock.ev.on('connection.update', async (update) => {
            const { connection, qr } = update;

            // Send QR Code image to frontend
            if (qr && !qrSent) {
                qrSent = true;
                try {
                    const qrImageUrl = await QRCode.toDataURL(qr);
                    if (!res.headersSent) {
                        res.json({ success: true, qr: qrImageUrl });
                    }
                } catch (err) {
                    if (!res.headersSent) {
                        res.json({ success: false, message: 'Failed to generate QR image.' });
                    }
                }
            }

            // Connection Successful
            if (connection === 'open') {
                console.log('Device Linked Successfully via QR Code!');

                setTimeout(async () => {
                    try {
                        const credsPath = path.join(sessionDir, 'creds.json');
                        if (fs.existsSync(credsPath)) {
                            const credsData = fs.readFileSync(credsPath, 'utf8');
                            const userJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';

                            const messageText = `✨ *LASHXBOT SESSION ID* ✨\n\nHeroku / Panel eke \`SESSION_ID\` variable ekata pahala thiyena text eka paste karaganna:\n\n\`\`\`${credsData}\`\`\`\n\n> © Powered by LashxBot`;

                            await sock.sendMessage(userJid, { text: messageText });
                            console.log('Session ID sent to WhatsApp!');
                        }
                    } catch (err) {
                        console.error('Error sending session message:', err.message);
                    } finally {
                        setTimeout(() => {
                            if (fs.existsSync(sessionDir)) {
                                fs.rmSync(sessionDir, { recursive: true, force: true });
                            }
                        }, 5000);
                    }
                }, 3000);
            }
        });

    } catch (err) {
        if (!res.headersSent) {
            res.json({ success: false, message: err.message });
        }
        if (fs.existsSync(sessionDir)) {
            fs.rmSync(sessionDir, { recursive: true, force: true });
        }
    }
});

app.listen(PORT, () => {
    console.log(`Session Generator Server running on port ${PORT}`);
});
