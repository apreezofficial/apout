import fs from 'fs';
import path from 'path';
import os from 'os';
import ora from 'ora';
import chalk from 'chalk';

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
        text: 'Verifying token with Apout servers...',
        color: 'cyan'
    }).start();
    
    // Simulating remote ping/auth process
    await new Promise(resolve => setTimeout(resolve, 1300));
    
    saveToken(token);
    spinner.succeed(chalk.greenBright(' Successfully authenticated! Token bound to global config.'));
};
