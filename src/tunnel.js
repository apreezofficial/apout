import ora from 'ora';
import chalk from 'chalk';
import WebSocket from 'ws';
import axios from 'axios';
import { getToken } from './auth.js';

export const startTunnelCommand = async (options) => {
    if (!options.port) {
        console.error(chalk.redBright('✖ Error:') + ' The --port option is required.');
        process.exit(1);
    }

    const token = getToken();
    if (!token) {
        console.error(chalk.redBright('✖ Error:') + ' Not logged in.');
        process.exit(1);
    }

    const subdomain = options.subdomain || Math.random().toString(36).substring(2, 9);
    const serverBaseUrl = process.env.APOUT_SERVER || 'localhost:8080';
    const serverUrl = serverBaseUrl.includes('://') ? serverBaseUrl.replace('http', 'ws') : `ws://${serverBaseUrl}`;
    const localBaseUrl = `http://127.0.0.1:${options.port}`;

    const spinner = ora('Connecting to Apout Relay...').start();
    const ws = new WebSocket(serverUrl);

    ws.on('open', () => {
        spinner.text = 'Authenticating...';
        ws.send(JSON.stringify({ type: 'auth', token, subdomain, local_port: options.port }));
    });

    ws.on('message', async (data) => {
        let msg;
        try {
            msg = JSON.parse(data);
        } catch (e) {
            console.error(chalk.red('  [ERROR] Received malformed message from server.'));
            return;
        }

        if (msg.type === 'authenticated') {
            spinner.succeed(chalk.greenBright('Tunnel online!'));
            // Derive public URL properly from configured server
            const domain = serverBaseUrl.replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '');
            const protocol = serverBaseUrl.startsWith('wss://') || serverBaseUrl.startsWith('https://') ? 'https' : 'http';
            console.log(chalk.cyan(`\n  🌐 Public: `) + chalk.white.underline(`${protocol}://${msg.subdomain}.${domain}`));
            console.log(chalk.cyan(`  💻 Local:  `) + chalk.white(localBaseUrl));
        }

        if (msg.type === 'error') {
            spinner.fail(chalk.red(msg.message));
            process.exit(1);
        }

        if (msg.type === 'request') {
            const { id, method, url, headers, body } = msg;
            const startTime = Date.now();
            
            try {
                const response = await axios({
                    method,
                    url: localBaseUrl + url,
                    headers: { ...headers, host: `127.0.0.1:${options.port}` },
                    data: body,
                    validateStatus: () => true
                });

                ws.send(JSON.stringify({
                    type: 'response',
                    id,
                    status: response.status,
                    headers: response.headers,
                    body: response.data
                }));

                const duration = Date.now() - startTime;
                console.log(`  [${chalk.dim(new Date().toLocaleTimeString())}] ${chalk.bold.white(method.padEnd(5))} ${url} ${chalk.dim('::')} ${chalk.green(response.status)} ${chalk.dim(`(${duration}ms)`)}`);
            } catch (err) {
                console.error(chalk.red(`  [ERROR] Failed to relay request: ${err.message}`));
                ws.send(JSON.stringify({ type: 'response', id, status: 502, body: 'Bad Gateway' }));
            }
        }
    });

    ws.on('close', () => {
        console.log(chalk.yellow('\n  Tunnel connection closed.'));
        process.exit(0);
    });

    ws.on('error', (err) => {
        spinner.fail(chalk.red('WebSocket Error: ' + err.message));
        process.exit(1);
    });
};
