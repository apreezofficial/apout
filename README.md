# ⚡ Apout - Secure Local Tunneling

Apout is a modern, beautiful, and open-source alternative to ngrok. It allows you to expose your local web servers to the internet securely via a central relay server and a sleek CLI.

## 🚀 Features

- **Instant Tunnels:** Expose local ports to the web in seconds.
- **Beautiful Dashboard:** Manage organizations, tunnels, and view request logs in real-time.
- **WebSocket Driven:** High-performance request/response relaying using WebSockets.
- **OAuth Ready:** Built-in support for GitHub and Google authentication.
- **Self-Hostable:** Deploy your own Apout relay server and dashboard.

---

## 🛠️ Self-Hosting Guide

If you want to run your own Apout server, follow these steps:

### 1. Prerequisites
- **Node.js** (v18+)
- **MySQL** (v8.0+)
- **npm** or **yarn**

### 2. Clone and Setup
```bash
git clone https://github.com/apreezofficial/apout.git
cd apout/server
npm install
```

### 3. Environment Configuration
Copy the example environment file and fill in your details:
```bash
cp .env.example .env
```
Edit `.env` and configure:
- `DB_HOST`, `DB_USER`, etc. (Database credentials)
- `APOUT_SERVER_URL` (The domain or IP where your server is hosted)
- `GITHUB_CLIENT_ID` & `GOOGLE_CLIENT_ID` (For OAuth login)

### 4. Initialize and Run
```bash
npm start
```
The server will automatically initialize the database schema on the first run.

---

## 💻 CLI Usage

The Apout CLI is used to create tunnels from your local machine.

### 1. Install CLI
```bash
cd apout
npm install -g .
```

### 2. Login
Get your API token from the dashboard (Settings > API Tokens) and run:
```bash
apout login <your_token>
```

### 3. Start a Tunnel
To expose a local server running on port 3000:
```bash
apout start --port 3000
```
Optional flags:
- `--subdomain <name>`: Request a specific custom subdomain.
- `--protocol <http|https>`: Force a specific protocol.

---

## 🐞 Recent Bug Fixes (v1.0.1)
- **Security:** Switched from plaintext password storage to SHA-256 hashing.
- **Reliability:** Fixed crashes in the invitation system due to missing database columns.
- **Consistency:** Tunnel URLs now dynamically resolve based on the `APOUT_SERVER_URL` environment variable.
- **Stability:** Added real-time token validation for the CLI `login` command.

## 📄 License
MIT License. Created by **Apcodesphere**.
