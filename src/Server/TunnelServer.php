<?php

namespace Apout\Server;

/**
 * High-Level Server Documentation / Architecture File
 * 
 * NOTE: While a CLI client can be built easily with standard synchronous PHP, 
 * the server-side proxy component demands high-concurrency event loops. 
 * A typical PHP approach to this would use Swoole, ReactPHP or Workerman.
 * 
 * Workerman Example Implementation Architecture:
 */

/*
use Workerman\Worker;
use Workerman\Connection\AsyncTcpConnection;

require_once __DIR__ . '/vendor/autoload.php';

// 1. WebSocket server to accept TCP tunnels from Apout Clients
$tunnel_worker = new Worker("websocket://0.0.0.0:8080");

// Store active connections [ subdomain => [ auth_token, connection_object ] ]
$worker_connections = []; 

$tunnel_worker->onMessage = function($connection, $data) use (&$worker_connections) {
    $payload = json_decode($data, true);
    
    // Auth Check
    if($payload['action'] === 'register') {
        $subdomain = $payload['subdomain'];
        $worker_connections[$subdomain] = $connection;
        $connection->send(json_encode(["status" => "tunnel_ready", "url" => "https://{$subdomain}.apout-server.com"]));
    }
};

// 2. HTTP Server to accept requests from browsers on apout-server.com
$http_worker = new Worker("http://0.0.0.0:80");

$http_worker->onMessage = function($connection, $request) use (&$worker_connections) {
    $host = $request->header('host'); // e.g., myapp.apout-server.com
    $subdomain = explode('.', $host)[0];
    
    // Validate if subdomain tunnel is active
    if (!isset($worker_connections[$subdomain])) {
        $connection->send(new \Workerman\Protocols\Http\Response(404, [], "Tunnel {$subdomain} not found or offline."));
        return;
    }
    
    // Retrieve tunnel connection
    $tunnel_connection = $worker_connections[$subdomain];
    
    // Forward the HTTP request to the Client WebSocket (Serialized)
    $tunnel_connection->send(json_encode([
        'type' => 'incoming_http',
        'method' => $request->method(),
        'path' => $request->uri(),
        'headers' => $request->header(),
        'body' => $request->rawBody()
    ]));

    // In a full implementation, you attach callbacks to catch the async response
    // from $tunnel_connection, and then stream it back into $connection->send();
};

Worker::runAll();
*/
