<?php

namespace Apout\Auth;

use Apout\Config\ConfigManager;

class Authenticator
{
    private ConfigManager $config;

    public function __construct()
    {
        $this->config = new ConfigManager();
    }

    public function login(string $token): bool
    {
        // Add robust communication with central server to verify token
        // e.g., using pure cURL:
        /*
        $ch = curl_init('https://api.apout-server.com/v1/auth/verify');
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Authorization: Bearer ' . $token]);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($httpCode !== 200) return false;
        */

        // Save token to ~/.apout/config.json
        $this->config->set('auth_token', $token);
        return true;
    }

    public function isAuthenticated(): bool
    {
        return !empty($this->config->get('auth_token'));
    }

    public function getToken(): ?string
    {
        return $this->config->get('auth_token');
    }
}
