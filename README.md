# Apout - PHP Ngrok Alternative

Apout is a PHP-based CLI application that allows you to expose local servers behind NATs and firewalls to the public internet securely. 

## 1. Directory Structure

```text
apout/
├── bin/
│   └── apout                 # CLI entry point
├── src/
│   ├── Client/               # Local tunneling logic (Socket forwarding)
│   ├── Auth/                 # Authentication & Token management
│   ├── Server/               # Server-side proxy reference architecture 
│   └── Config/               # JSON config management (~/.apout/config.json)
├── composer.json             # Composer configuration
└── README.md
```

## 2. Installation

Install Apout globally using Composer:

```bash
composer global require username/apout
```
*(Make sure your `~/.composer/vendor/bin` directory is configured in your system `$PATH`)*

## 3. Step-by-Step Setup Instructions

1. **Clone the repository** (if setting up from source):
   ```bash
   git clone https://github.com/username/apout.git
   cd apout
   composer install
   ```

2. **Make the CLI executable** (Linux/Mac):
   ```bash
   chmod +x bin/apout
   ```

3. **Authenticate**: Log in with your Apout Token (You would usually get this from apout-server.com dashboard):
   ```bash
   apout login your_auth_token_here
   ```
   *Your token will be safely stored in `~/.apout/config.json`.*

## 4. Usage & Example Workflows

Once authenticated, start your local server. For example:
```bash
php -S localhost:3000
```

On a separate terminal, deploy the tunnel using Apout:

**Basic Tunnel (Random Subdomain):**
```bash
apout start --port=3000
```

**Custom Subdomain:**
```bash
apout start --port=3000 --subdomain=myapp
```

**Custom Protocol (HTTP vs HTTPS):**
```bash
apout start --port=3000 --subdomain=myapp --protocol=http
```

## 5. How It Works
- The Apout CLI is built on **Symfony Console** for elegant cross-platform command-line operations.
- The `ConfigManager` safely encrypts/stores state data in your `~/.apout` directory.
- `TunnelClient` simulates a bidirectional WebSocket stream using TCP pipelines.
- Traffic arrives at `apout-server.com`, is passed through the proxy pipeline back to your CLI socket, which in turn performs a local cURL / stream proxy to `localhost:3000` and flushes the response back upstream.

## 6. Server-Side Requirements
Due to PHP's request-response lifecycle under Nginx/Apache, standard PHP cannot proxy persistent TCP sockets natively without long-polling limitations. The `TunnelServer.php` script contains a demonstration of how a persistent event-driven proxy server can be set up in pure PHP using **Workerman** or **Swoole** for the centralized `apout-server.com` backend!
