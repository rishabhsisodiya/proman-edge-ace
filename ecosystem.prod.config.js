module.exports = {
  apps: [
    {
      name: 'proman-prod-backend',
      cwd: '/root/proman-edge-ace-prod/backend',
      script: 'dist/src/main.js',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      env: {
        NODE_ENV: 'production',
        PORT: '4001',
        TZ: 'Asia/Kolkata'
      }
    },
    {
      name: 'proman-prod-frontend',
      cwd: '/root/proman-edge-ace-prod/frontend',
      script: 'npm',
      args: 'run start -- -p 3001',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      env: {
        NODE_ENV: 'production',
        PORT: '3001',
        TZ: 'Asia/Kolkata'
      }
    }
  ]
}
