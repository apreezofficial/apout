import fs from 'fs';
import path from 'path';
import os from 'os';
import ora from 'ora';
import chalk from 'chalk';
import fetch from 'node-fetch';

const getConfigPath = () => {
    const homeDir = os.homedir();
    const apoutDir = path.join(homeDir, '.apout');
    if (!fs.existsSync(apoutDir)) {
        fs.mkdirSync(apoutDir, { recursive: true });
    }
    return path.join(apoutDir, 'config.json');
};

export const saveToken = (token) => {
    const configPath = getConfigPath();
    let config = {};
    if (fs.existsSync(configPath)) {
        try {
            config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        } catch(e) {}
    }
    config.auth_token = token;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
};

export const getToken = () => {
    const configPath = getConfigPath();
    if (fs.existsSync(configPath)) {
        try {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            return config.auth_token;
        } catch(e) {}
    }
    return null;
};

export const loginCommand = async (token) => {
    const spinner = ora({
        text: 'Verifying token with Apout server...',
        color: 'cyan'
    }).start();

    const serverUrl = process.env.APOUT_SERVER || 'http://localhost:8080';

    try {
        const res = await fetch(`${serverUrl}/api/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) {
            spinner.fail(chalk.redBright(' Invalid token. Please check your token on the Apout dashboard.'));
            process.exit(1);
        }

        saveToken(token);
        spinner.succeed(chalk.greenBright(' Successfully authenticated! Token saved to global config.'));
    } catch (err) {
        spinner.fail(chalk.redBright(` Could not reach Apout server at ${serverUrl}. Is it running?`));
        process.exit(1);
    }
};
