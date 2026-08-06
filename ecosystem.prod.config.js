module.exports = {
  apps: [
    {
      name: 'proman-prod-backend',
      cwd: '/root/proman-edge-ace-prod/backend',
      script: 'doppler',
      args: 'run -- node dist/src/main.js',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      env: {
        NODE_ENV: 'production',
        PORT: '4001',
        TZ: 'Asia/Kolkata',
        DOPPLER_TOKEN: process.env.DOPPLER_TOKEN
      }
    },
    {
      name: 'proman-prod-frontend',
      cwd: '/root/proman-edge-ace-prod/frontend',
      script: 'doppler',
      args: 'run -- npm run start -- -p 3001',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      env: {
        NODE_ENV: 'production',
        PORT: '3001',
        TZ: 'Asia/Kolkata',
        DOPPLER_TOKEN: process.env.DOPPLER_TOKEN
      }
    }
  ]
}
