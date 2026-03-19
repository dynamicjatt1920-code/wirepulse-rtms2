# WirePulse RTMS — Ready to Deploy

## Upload this entire folder to your Hostinger VPS.

### Quick Start on Server:

```bash
# 1. Install dependencies
npm install

# 2. Seed the database (first time only)
node db/seed.js

# 3. Start the app
node server.js
```

### With PM2 (recommended):

```bash
npm install
node db/seed.js
pm2 start server.js --name wirepulse-rtms
pm2 save
```

App runs on port 4000 by default. Configure Nginx to proxy port 80 → 4000.

### Structure:
```
wirepulse-deploy/
├── server.js         ← Main entry point
├── package.json      ← Dependencies
├── .env              ← Environment config (edit JWT_SECRET!)
├── db/               ← Database layer + seed script
├── routes/           ← API route handlers
├── middleware/        ← Auth middleware
├── services/         ← PLC simulator, AI engine
└── public/           ← Built frontend (served automatically)
```
