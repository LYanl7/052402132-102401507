import type { NextConfig } from 'next';
const config: NextConfig = {
  devIndicators: false,
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  transpilePackages: ['@mayoimon/shared'],
  serverExternalPackages: ['ws'],
};
export default config;
