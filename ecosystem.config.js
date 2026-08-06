module.exports = {
  apps: [
    {
      name: 'proman-backend',
      cwd: '/root/proman-edge-ace/backend',
      script: 'dist/src/main.js',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      env: {
        // plain HTTP until nginx/TLS is set up — 'production' would force
        // Secure cookies, which browsers silently drop over HTTP
        NODE_ENV: 'development',
        PORT: '4000',
        TZ: 'Asia/Kolkata'
      }
    },
    {
      name: 'proman-frontend',
      cwd: '/root/proman-edge-ace/frontend',
      script: 'npm',
      args: 'run start -- -p 3000',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
        TZ: 'Asia/Kolkata'
      }
    }
  ]
}
