<?php

namespace Apout\Config;

class ConfigManager
{
    private string $configPath;

    public function __construct()
    {
        $homeDir = getenv('HOME') ?: getenv('USERPROFILE');
        $apoutDir = $homeDir . DIRECTORY_SEPARATOR . '.apout';
        
        if (!is_dir($apoutDir)) {
            mkdir($apoutDir, 0777, true);
        }

        $this->configPath = $apoutDir . DIRECTORY_SEPARATOR . 'config.json';
    }

    public function get(string $key, $default = null)
    {
        $config = $this->load();
        return $config[$key] ?? $default;
    }

    public function set(string $key, $value): void
    {
        $config = $this->load();
        $config[$key] = $value;
        $this->save($config);
    }

    private function load(): array
    {
        if (!file_exists($this->configPath)) {
            return [];
        }
        $content = file_get_contents($this->configPath);
        return json_decode($content, true) ?: [];
    }

    private function save(array $config): void
    {
        file_put_contents($this->configPath, json_encode($config, JSON_PRETTY_PRINT));
    }
}
