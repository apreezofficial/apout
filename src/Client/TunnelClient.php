<?php

namespace Apout\Client;

use Symfony\Component\Console\Output\OutputInterface;

class TunnelClient
{
    private string $remoteHost;
    private int $localPort;
    private string $token;

    public function __construct(string $remoteHost, int $localPort, string $token)
    {
        $this->remoteHost = $remoteHost;
        $this->localPort = $localPort;
        $this->token = $token;
    }

    public function connect(OutputInterface $output): void
    {
        $output->writeln("<info>Forwarding:</info>           https://{$this->remoteHost} -> http://127.0.0.1:{$this->localPort}");
        $output->writeln("<comment>Press Ctrl+C to stop.</comment>");
        $output->writeln("");

        // Simulated TCP / WebSocket connection routine here
        // The real implementation would:
        // 1. fsockopen or stream_socket_client to `tunnel.apout-server.com`
        // 2. Perform WebSocket handshake or custom TCP payload establishing the session ID / Subdomain
        // 3. Keep a non-blocking loop (stream_select) waiting for binary data (Incoming HTTP request proxy)
        // 4. Upon getting data, stream_socket_client to `127.0.0.1:{$this->localPort}`
        // 5. Pipe connection from server <-> localhost socket.
        
        // Simulating the console log
        while (true) {
            $methods = ['GET', 'POST', 'PUT'];
            $paths = ['/', '/api/users', '/assets/app.css', '/assets/app.js'];
            $statuses = ['200 OK', '404 Not Found', '500 Internal Error', '201 Created'];
            
            $method = $methods[array_rand($methods)];
            $path = $paths[array_rand($paths)];
            $status = $statuses[array_rand($statuses)];
            
            $time = date('H:i:s');
            
            if (rand(1, 100) > 85) { 
                $statusColor = str_contains($status, '20') ? 'info' : (str_contains($status, '40') ? 'comment' : 'error');
                $output->writeln("[{$time}] {$method} {$path} - <{$statusColor}>{$status}</{$statusColor}>");
            }
            
            usleep(400000); // 400ms event tick
        }
    }
}
