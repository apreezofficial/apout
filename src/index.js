import { Command } from 'commander';
import { loginCommand } from './auth.js';
import { startTunnelCommand } from './tunnel.js';
import boxen from 'boxen';
import chalk from 'chalk';

console.log(
  boxen(
    chalk.cyan.bold(' ⚡ APOUT ') + chalk.white(' - Secure Local Tunneling ') + '\n' + chalk.dim('    Version 1.0.0 by Apcodesphere'), 
    {
      padding: 1,
      margin: 1,
      borderStyle: 'round',
      borderColor: 'cyanBright',
      backgroundColor: '#0A0A0A'
    }
  )
);

const program = new Command();

program
  .name('apout')
  .description('Expose your local server to the internet securely with a beautiful CLI')
  .version('1.0.0');

program
  .command('login <token>')
  .description('Authenticate with Apout using your API token')
  .action(loginCommand);

program
  .command('start')
  .description('Start a new tunnel')
  .option('-p, --port <number>', 'Local port to expose')
  .option('-s, --subdomain <name>', 'Custom subdomain')
  .option('-P, --protocol <prefix>', 'http or https', 'https')
  .action(startTunnelCommand);

program.parse(process.argv);
