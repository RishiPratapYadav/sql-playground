const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

// ensure directories
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const DATA_FILE = path.join(__dirname, 'data', 'requests.json');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify([]));

// serve static UI
app.use(express.static(path.join(__dirname, 'public')));

// file storage config
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename: function (req, file, cb) {
    // keep unique name
    const timestamp = Date.now();
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${timestamp}_${safeName}`);
  }
});
const upload = multer({ storage });

// API: get a list of available form schemas
app.get('/api/schemas', (req, res) => {
  const schemasDir = path.join(__dirname, 'public', 'formSchemas');
  try {
    const list = fs.readdirSync(schemasDir)
      .filter(f => f.endsWith('.json'))
      .map(f => ({ id: f.replace('.json', ''), file: `/formSchemas/${f}` }));
    res.json(list);
  } catch (err) {
    res.json([]);
  }
});

// API: create a new request (metadata + optional files)
app.post('/api/requests', upload.array('files'), (req, res) => {
  const body = req.body || {};
  const files = (req.files || []).map(f => ({ originalname: f.originalname, path: `/uploads/${path.basename(f.path)}`, size: f.size }));

  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const id = `REQ-${Date.now()}`;
  const entry = { id, createdAt: new Date().toISOString(), body: body, files };
  data.push(entry);
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));

  res.json({ success: true, id, entry });
});

// API: list requests
app.get('/api/requests', (req, res) => {
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  res.json(data);
});

// static directories mount full path for access (uploads and schemas)
app.use('/uploads', express.static(UPLOAD_DIR));
app.use('/formSchemas', express.static(path.join(__dirname, 'public', 'formSchemas')));

app.listen(PORT, () => {
  console.log(`VSP step1 server listening on http://localhost:${PORT}`);
});
