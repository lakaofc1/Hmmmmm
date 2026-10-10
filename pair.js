const express = require('express')
const fs = require('fs')
const path = require('path')
const pino = require('pino')

const {
  default: makeWASocket,
  useMultiFileAuthState,
  delay,
  Browsers,
  makeCacheableSignalKeyStore,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys')

const router = express.Router()

/* ===== UTILS ===== */
function removeFile(filePath) {
  if (fs.existsSync(filePath)) fs.rmSync(filePath, { recursive: true, force: true })
}

function makeid(num = 4) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let res = ''
  for (let i = 0; i < num; i++) {
    res += chars[Math.floor(Math.random() * chars.length)]
  }
  return res
}

/* ===== ROUTER ===== */
router.get('/', async (req, res) => {
  const id = makeid()
  let num = req.query.number
  const SESSION_DIR = path.join(__dirname, 'temp', '_' + id)
  let sock = null
  let shouldReconnect = true

  async function PAIR_CODE() {
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR)

    try {
      const { version } = await fetchLatestBaileysVersion()

      sock = makeWASocket({
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' }))
        },
        logger: pino({ level: 'fatal' }),
        browser: Browsers.macOS('Safari'),
        version,
        printQRInTerminal: false
      })

      sock.ev.on('creds.update', saveCreds)

      /* ===== PAIR CODE ===== */
      if (!sock.authState.creds.registered) {
        await delay(1500)
        num = num.replace(/[^0-9]/g, '')
        const code = await sock.requestPairingCode(num)
        if (!res.headersSent) res.json({ code })
      }

      sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update

        /* ===== CONNECTED ===== */
        if (connection === 'open') {
          try {
            console.log('✅ Connected:', sock.user.id)
            await delay(4000)

            // Send Session File & Base64 String to WhatsApp Inbox
            const credsPath = path.join(SESSION_DIR, 'creds.json')
            if (fs.existsSync(credsPath)) {
              const credsBuffer = fs.readFileSync(credsPath)
              const base64Session = credsBuffer.toString('base64')

              // 1. creds.json Document එක යැවීම
              await sock.sendMessage(sock.user.id, {
                document: credsBuffer,
                mimetype: 'application/json',
                fileName: 'creds.json',
                caption: `*✅ WhatsApp Connected Successfully!*\n\nHere is your creds.json session file.`
              })

              // 2. Base64 Session ID එක යැවීම
              await sock.sendMessage(sock.user.id, {
                text: `*🔑 Your Session ID:*\n\nSESSION_ID;;;${base64Session}`
              })
            }

            console.log('✅ Session files sent to inbox successfully!')

            // ටික වේලාවකට පසු temporary folder එක මකා දැමීම (Logout නොකරයි)
            setTimeout(() => {
              removeFile(SESSION_DIR)
            }, 10000)

          } catch (e) {
            console.log('⚠️ Error:', e.message)
            removeFile(SESSION_DIR)
          }
        }

        /* ===== RECONNECT ===== */
        if (
          connection === 'close' &&
          lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut &&
          shouldReconnect
        ) {
          PAIR_CODE()
        }
        
        /* ===== LOGGED OUT ===== */
        if (lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut) {
          console.log('🔒 Logged out, cleaning session...')
          shouldReconnect = false
          removeFile(SESSION_DIR)
        }
      })

    } catch (err) {
      console.log('❌ Error:', err.message)
      shouldReconnect = false
      removeFile(SESSION_DIR)
      if (!res.headersSent) res.json({ error: 'Service Unavailable' })
    }
  }

  PAIR_CODE()
})

module.exports = router
