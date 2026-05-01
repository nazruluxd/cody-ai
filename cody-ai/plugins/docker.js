// plugins/docker.js — Example Cody plugin: Docker helpers
//
// Drop this file in ~/.cody/plugins/ or .cody/plugins/ in your project.
// Cody will auto-discover it on startup.

export default {
  name: 'Docker',
  description: 'Docker container and compose helpers',

  tools: [
    {
      name: 'docker_status',
      description: 'Show running Docker containers and their status',
      input_schema: {
        type: 'object',
        properties: {},
      },
      execute: async (_input, cwd) => {
        const { execSync } = await import('child_process');
        try {
          return execSync('docker ps --format "table {{.Names}}\\t{{.Image}}\\t{{.Status}}\\t{{.Ports}}"', {
            cwd,
            encoding: 'utf8',
          });
        } catch {
          return 'Docker is not running or not installed.';
        }
      },
    },

    {
      name: 'docker_logs',
      description: 'Fetch recent logs from a Docker container',
      input_schema: {
        type: 'object',
        properties: {
          container: { type: 'string', description: 'Container name or ID' },
          lines:     { type: 'number', description: 'Number of lines to show (default: 50)' },
        },
        required: ['container'],
      },
      execute: async ({ container, lines = 50 }, cwd) => {
        const { execSync } = await import('child_process');
        try {
          return execSync(`docker logs --tail ${lines} ${container}`, {
            cwd,
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
          });
        } catch (err) {
          return `Error: ${err.stderr || err.message}`;
        }
      },
    },

    {
      name: 'docker_compose_up',
      description: 'Start services defined in docker-compose.yml',
      input_schema: {
        type: 'object',
        properties: {
          services: {
            type: 'array',
            items: { type: 'string' },
            description: 'Specific services to start (empty = all)',
          },
          detached: { type: 'boolean', description: 'Run in detached mode (default: true)' },
        },
      },
      execute: async ({ services = [], detached = true }, cwd) => {
        const { execSync } = await import('child_process');
        const svcStr = services.join(' ');
        const flag = detached ? '-d' : '';
        return execSync(`docker compose up ${flag} ${svcStr}`.trim(), {
          cwd,
          encoding: 'utf8',
          timeout: 60_000,
        });
      },
    },
  ],
};
