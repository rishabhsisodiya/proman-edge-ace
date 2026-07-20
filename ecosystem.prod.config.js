module.exports = {
  apps: [
    {
      name: 'proman-prod-backend',
      cwd: '/root/proman-edge-ace-prod/backend',
      script: 'dist/src/main.js',
      env: {
        NODE_ENV: 'production',
        PORT: '4001'
      }
    },
    {
      name: 'proman-prod-frontend',
      cwd: '/root/proman-edge-ace-prod/frontend',
      script: 'npm',
      args: 'run start -- -p 3001',
      env: {
        NODE_ENV: 'production',
        PORT: '3001'
      }
    }
  ]
}
