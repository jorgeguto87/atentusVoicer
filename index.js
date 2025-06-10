const express = require('express');
const fileUpload = require('express-fileupload');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const port = 4001;

app.use(cors());
app.use(fileUpload());
app.use(express.static('public')); // Serve arquivos frontend (html, js, css)

// Pasta uploads (fora do public)
const AUDIO_TEMP_FOLDER = path.join(__dirname, 'uploads');
if (!fs.existsSync(AUDIO_TEMP_FOLDER)) {
  fs.mkdirSync(AUDIO_TEMP_FOLDER);
}

// WhatsApp Client
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-gpu'
    ]
  }
});

client.on('qr', qr => {
  console.log('🔳 Escaneie o QR Code no terminal para autenticar.');
  const qrcode = require('qrcode-terminal');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('✅ Cliente WhatsApp está pronto.');
});

client.initialize();

// Rota para receber áudio e enviar no WhatsApp
app.post('/send-audio', async (req, res) => {
  try {
    if (!req.files || !req.body.number) {
      return res.status(400).json({ status: 'Número ou áudio ausente.' });
    }

    const audioFile = req.files.audio;
    const tempPath = path.join(AUDIO_TEMP_FOLDER, 'temp_audio.ogg');
    await audioFile.mv(tempPath);

    const media = await MessageMedia.fromFilePath(tempPath);
    const number = req.body.number;

    await client.sendMessage(number, media);
    fs.unlinkSync(tempPath);

    return res.json({ status: 'Áudio enviado com sucesso para ' + number });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ status: 'Erro ao enviar áudio.' });
  }
});

// Limpeza automática de arquivos .ogg antigos
const CLEANUP_INTERVAL = 1000 * 60 * 10; // 10 minutos

function cleanupOldFiles() {
  fs.readdir(AUDIO_TEMP_FOLDER, (err, files) => {
    if (err) {
      console.error('Erro ao listar arquivos para limpeza:', err);
      return;
    }
    files.forEach(file => {
      if (file.endsWith('.ogg')) {
        const filePath = path.join(AUDIO_TEMP_FOLDER, file);
        fs.stat(filePath, (err, stats) => {
          if (err) {
            console.error('Erro ao obter stats do arquivo:', err);
            return;
          }
          const now = Date.now();
          const age = now - stats.mtimeMs;
          if (age > CLEANUP_INTERVAL) {
            fs.unlink(filePath, err => {
              if (err) console.error('Erro ao deletar arquivo:', err);
              else console.log('Arquivo removido:', file);
            });
          }
        });
      }
    });
  });
}

setInterval(cleanupOldFiles, CLEANUP_INTERVAL);

app.listen(port, () => {
  console.log(`🚀 Backend rodando na porta ${port}`);
});
