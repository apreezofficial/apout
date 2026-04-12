<?php

namespace Apout\Auth;

use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;
use Symfony\Component\Console\Input\InputArgument;

class LoginCommand extends Command
{
    protected static $defaultName = 'login';

    protected function configure()
    {
        $this
            ->setDescription('Authenticate with Apout using your API token')
            ->addArgument('token', InputArgument::REQUIRED, 'Your Apout authentication token');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);
        $token = $input->getArgument('token');

        $auth = new Authenticator();
        
        $io->info('Verifying token...');
        
        if ($auth->login($token)) {
            $io->success('Successfully authenticated! Token saved to ~/.apout/config.json');
            return Command::SUCCESS;
        }

        $io->error('Failed to authenticate. The token provided might be invalid.');
        return Command::FAILURE;
    }
}
