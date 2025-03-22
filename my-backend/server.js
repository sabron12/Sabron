const express = require('express');
const formidable = require('formidable');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const session = require('express-session');
const fs = require('fs');

const app = express();
const port = 3000;

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// Middleware
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));
app.use(express.json());
app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

// Initialize SQLite database
const db = new sqlite3.Database('./submissions.db', (err) => {
    if (err) console.error('Error connecting to database:', err.message);
    else console.log('Connected to SQLite database.');
});

// Ensure tables exist
db.run(`
    CREATE TABLE IF NOT EXISTS submissions (
        id INTEGER PRIMARY KEY,
        fullName TEXT,
        phone TEXT,
        email TEXT,
        description TEXT,
        birthCertificate TEXT,
        resultSlip TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);


db.run(`CREATE TABLE IF NOT EXISTS blocked_users (email TEXT UNIQUE)`);

//Admin Authentication Middleware
function requireAdminAuth(req, res, next) {
    if (!req.session.isAdmin) return res.status(401).send('Unauthorized');
    next();
}

// Routes
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'service.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin-login.html')));
app.get('/admin/dashboard', requireAdminAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

// Admin Login
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    if (username === 'sabron' && password === 'sabronwamudha1') {
        req.session.isAdmin = true;
        return res.sendStatus(200);
    }
    res.status(401).send('Invalid credentials');
});

// Admin Logout
app.get('/admin/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/admin'));
});

// Form Submission (with Block Check) - GMT+3 Timestamp
app.post('/submit', (req, res) => {
    const form = new formidable.IncomingForm({
        uploadDir: uploadDir,
        keepExtensions: true,
        maxFileSize: 10 * 1024 * 1024, // 10MB limit
        multiples: true,
    });

    form.parse(req, (err, fields, files) => {
        if (err) {
            console.error('Form parsing error:', err);
            return res.status(400).json({ error: 'File upload error.' });
        }

        // Ensure fields are correctly accessed
        const fullName = fields.fullName ? fields.fullName[0] : '';
        const phone = fields.phone ? fields.phone[0] : '';
        const email = fields.email ? fields.email[0] : '';
        const description = fields.description ? fields.description[0] : '';

        if (!fullName || !phone || !email || !description) {
            return res.status(400).json({ error: 'All fields are required.' });
        }

        if (!files.birthCertificate || !files.resultSlip) {
            return res.status(400).json({ error: 'Missing required files.' });
        }

        if (blockedUsers.has(email)) return res.status(403).json({ error: 'Access Denied. You are blocked.' });

        // Get uploaded file names
        const birthCertificate = path.basename(files.birthCertificate[0].filepath);
        const resultSlip = path.basename(files.resultSlip[0].filepath);

        // Get current time in GMT+3
        const timestampGMT3 = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);

        db.run(`
            INSERT INTO submissions (fullName, phone, email, description, birthCertificate, resultSlip, timestamp) 
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
            [fullName, phone, email, description, birthCertificate, resultSlip, timestampGMT3],
            (err) => {
                if (err) {
                    console.error('Database Insert Error:', err);
                    return res.status(500).json({ error: 'Internal Server Error' });
                }
                res.redirect('/success.html');
            });
    });
});

// Fetch All Submissions (Admin Only)
app.get('/api/admin/submissions', requireAdminAuth, (req, res) => {
    
    
    db.all('SELECT * FROM submissions ORDER BY timestamp DESC', (err, rows) => {
        if (err) return res.status(500).json({ error: 'Error fetching submissions' });
        res.json(rows);
    });
});



// Clear All Submissions
app.delete('/api/admin/clear-submissions', requireAdminAuth, (req, res) => {
    db.run('DELETE FROM submissions', (err) => {
        if (err) return res.status(500).send('Error clearing submissions');
        res.sendStatus(200);
    });
});

// Block User
app.post('/api/admin/block-user', requireAdminAuth, (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).send('Email is required.');

    db.run('INSERT OR IGNORE INTO blocked_users (email) VALUES (?)', [email], (err) => {
        if (err) return res.status(500).send('Error blocking user');
    
    
        blockedUsers.add(email);
    
    
        res.sendStatus(200);
    });
});

// Unblock User
app.post('/api/admin/unblock-user', requireAdminAuth, (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).send('Email is required.');

    db.run('DELETE FROM blocked_users WHERE email = ?', [email], (err) => {
        if (err) return res.status(500).send('Error unblocking user');
   
   
        blockedUsers.delete(email);
   
   
        res.sendStatus(200);
    });
});







// Improved Download Route
app.get('/api/download/:filename', (req, res) => {
    const { filename } = req.params;
    const filePath = path.join(uploadDir, filename);

    fs.access(filePath, fs.constants.F_OK, (err) => {
        if (err) return res.status(404).send('File not found.');

        res.download(filePath, filename, (downloadErr) => {
            if (downloadErr) res.status(500).send('Error downloading file.');
        });
    });
});





// KUCCPS Form Submission (without file upload)
app.post('/submit-kuccps', (req, res) => {
    const form = new formidable.IncomingForm({
        multiples: false, // No multiple file uploads needed
    });

    form.parse(req, (err, fields) => {
        if (err) {
            console.error('Form Parsing Error:', err);
            return res.status(400).json({ error: 'Error processing form submission.' });
        }

        // Extract fields
        const {
            fullName, phone, email, description,
            indexNumber, kcseYear, birthCertNumber, primaryIndexNumber
        } = fields;

        // Validate required fields
        if (!fullName || !phone || !email || !description || !indexNumber || !kcseYear || !birthCertNumber || !primaryIndexNumber) {
            return res.status(400).json({ error: 'All fields are required.' });
        }

        // Prevent blocked users from submitting
        if (blockedUsers.has(email[0])) {
            return res.status(403).json({ error: 'Access denied. You are blocked.' });
        }

        app.post('/submit', (req, res) => {
            if (req.session.userEmail && blockedUsers.has(`${req.session.userEmail}-${req.sessionID}`)) {
                return res.status(403).send('Submission denied: You are blocked.');
            }
        
            res.send('Form submitted successfully.');
        });
        

        // Ensure we get correct field values
        const fullNameValue = fullName[0];
        const phoneValue = phone[0];
        const emailValue = email[0];
        const descriptionValue = description[0];
        const indexNumberValue = indexNumber[0];
        const kcseYearValue = kcseYear[0];
        const birthCertNumberValue = birthCertNumber[0];
        const primaryIndexNumberValue = primaryIndexNumber[0];

        // Get current timestamp in GMT+3
        const timestampGMT3 = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);

        // Insert into database
        db.run(`
            INSERT INTO submissions (
                fullName, phone, email, description, indexNumber, kcseYear, birthCertNumber, primaryIndexNumber, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
            [fullNameValue, phoneValue, emailValue, descriptionValue, indexNumberValue, kcseYearValue, birthCertNumberValue, primaryIndexNumberValue, timestampGMT3],
            (err) => {
                if (err) {
                    console.error('Database Insert Error:', err);
                    return res.status(500).json({ error: 'Database error during submission.' });
                }
                res.status(200).json({ message: 'Form submitted successfully!' });
            });
    });
});

// Add new fields if they do not exist
const addColumns = [
    { name: 'indexNumber', type: 'TEXT' },
    { name: 'kcseYear', type: 'INTEGER' },
    { name: 'birthCertNumber', type: 'TEXT' },
    { name: 'primaryIndexNumber', type: 'TEXT' },
];

addColumns.forEach(({ name, type }) => {
    db.all(`PRAGMA table_info(submissions)`, (err, rows) => {
        if (err) {
            console.error('Error checking table schema:', err.message);
            return;
        }

        const columnExists = rows.some(row => row.name === name);
        if (!columnExists) {
            db.run(`ALTER TABLE submissions ADD COLUMN ${name} ${type}`, (err) => {
                if (err) console.error(`Error adding column ${name}:`, err.message);
                else console.log(`✅ Column "${name}" added successfully.`);
            });
        }
    });
});


// Logout route (clears session)
app.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Logout failed' });
        }
        res.clearCookie('sessionId'); // Clear session cookie if used
        res.status(200).json({ message: 'Logged out successfully' });
    });
});


app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 300000 // 5 minutes
    }
}));

const PORT = process.env.PORT || 4000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});

const blockedUsers = new Set();
  
