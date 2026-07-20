module.exports = {
  apps: [
    {
      name: 'proman-backend',
      cwd: '/root/proman-edge-ace/backend',
      script: 'dist/main.js',
      env: {
        NODE_ENV: 'production',
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
