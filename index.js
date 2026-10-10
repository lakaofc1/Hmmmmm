const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;
const pairRouter = require('./pair'); // ඉහත router file එක save කළ නම (ഉദാ: pair.js නම්)

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Front-end UI (පහසුවෙන් අංකය ලබා දී කේතය බලා ගැනීමට)
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
                        const res = await fetch('/pair?number=' + encodeURIComponent(phone));
                        const data = await res.json();
                        if(data.code) {
                            resultDiv.innerHTML = "<h3>Your Pairing Code:</h3><h1 style='color:#22c55e;background:#0f172a;padding:10px;border-radius:6px;letter-spacing:2px;'>" + data.code + "</h1><p>Check your WhatsApp inbox for the session file and ID after linking!</p>";
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

// Router mount කිරීම
app.use('/pair', pairRouter);

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
