module.exports = {
  apps: [
    {
      name: 'proman-backend',
      cwd: '/root/proman-edge-ace/backend',
      script: 'dist/src/main.js',
      env: {
        // plain HTTP until nginx/TLS is set up — 'production' would force
        // Secure cookies, which browsers silently drop over HTTP
        NODE_ENV: 'development',
        PORT: '4000'
      }
    },
    {
      name: 'proman-frontend',
      cwd: '/root/proman-edge-ace/frontend',
      script: 'npm',
      args: 'run start -- -p 3000',
      env: {
        NODE_ENV: 'production',
        PORT: '3000'
      }
    }
  ]
}
