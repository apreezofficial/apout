<?php

namespace Apout\Client;

use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Style\SymfonyStyle;
use Apout\Auth\Authenticator;

class StartTunnelCommand extends Command
{
    protected static $defaultName = 'start';

    protected function configure()
    {
        $this
            ->setDescription('Start a new tunnel')
            ->addOption('port', 'p', InputOption::VALUE_REQUIRED, 'Local port to expose')
            ->addOption('subdomain', 's', InputOption::VALUE_OPTIONAL, 'Custom subdomain (generates random if not provided)')
            ->addOption('protocol', null, InputOption::VALUE_OPTIONAL, 'http or https', 'https')
            ->addOption('auth', null, InputOption::VALUE_NONE, 'Enable HTTP basic authentication placeholder');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);
        
        $port = $input->getOption('port');
        if (!$port) {
            $io->error('The --port option is required.');
            return Command::FAILURE;
        }

        $auth = new Authenticator();
        if (!$auth->isAuthenticated()) {
            $io->error('You must be logged in to start a tunnel. Use: apout login <token>');
            return Command::FAILURE;
        }

        // Random subdomain if none is supplied
        $subdomain = $input->getOption('subdomain') ?? substr(bin2hex(random_bytes(4)), 0, 7);
        
        // Display header
        $io->title('Apout by Username');
        $io->text("Session Status:     online");
        $io->text("Account:            authed_user");
        $io->text("Version:            1.0.0");
        $io->newLine();

        $client = new TunnelClient("{$subdomain}.apout-server.com", (int)$port, $auth->getToken());
        $client->connect($output);

        return Command::SUCCESS;
    }
}
