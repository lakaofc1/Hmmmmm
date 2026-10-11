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
const NodeCache = require('node-cache');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;
const msgRetryCounterCache = new NodeCache({ stdTTL: 0, checkperiod: 0 });

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/generate', async (req, res) => {
    let phoneNumber = req.body.phone;
    if (!phoneNumber) {
        return res.json({ success: false, message: 'WhatsApp phone number is required!' });
    }

    phoneNumber = phoneNumber.replace(/\D/g, '');
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
    browser: Browsers.ubuntu("Chrome"),
    msgRetryCounterCache
});


        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection } = update;

            if (connection === 'open') {
                console.log(`Session connected for ${phoneNumber}`);

                setTimeout(async () => {
                    try {
                        const credsPath = path.join(sessionDir, 'creds.json');
                        if (fs.existsSync(credsPath)) {
                            const credsData = fs.readFileSync(credsPath, 'utf8');
                            const targetJid = `${phoneNumber}@s.whatsapp.net`;

                            const messageText = `✨ *LASHXBOT SESSION ID* ✨\n\nHeroku / Panel eke \`SESSION_ID\` variable ekata pahala thiyena text eka paste karaganna:\n\n\`\`\`${credsData}\`\`\`\n\n> © Powered by LashxBot`;

                            await sock.sendMessage(targetJid, { text: messageText });
                            console.log('Session ID sent to WhatsApp chat successfully!');
                        }
                    } catch (err) {
                        console.error('Error sending session to WhatsApp:', err.message);
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

        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode(phoneNumber);
                code = code?.match(/.{1,4}/g)?.join('-') || code;
                return res.json({ success: true, code: code });
            } catch (err) {
                if (fs.existsSync(sessionDir)) {
                    fs.rmSync(sessionDir, { recursive: true, force: true });
                }
                return res.json({ success: false, message: 'Failed to request pairing code. Make sure country code is included.' });
            }
        }, 3000);

    } catch (err) {
        if (fs.existsSync(sessionDir)) {
            fs.rmSync(sessionDir, { recursive: true, force: true });
        }
        return res.json({ success: false, message: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Session Generator Server running on port ${PORT}`);
});
